'use strict';

// 正規化座標でのユークリッド距離。これ未満なら「ほぼ同じ位置」とみなす
const POSITION_THRESHOLD = 0.03;
// これ未満の投票間隔を「連続投票」とみなす(秒)
const TIME_THRESHOLD_SEC = 0.5;
// 同じ位置への連続投票がこの回数以上でシグナルとして採用
const MIN_RUN_LENGTH = 5;

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// prev/currの両方にtap_x, tap_y, viewport_w, viewport_hが数値として揃っている場合のみ
// 正規化座標同士のユークリッド距離を返す。欠けていればnull。
function computePosDelta(prev, curr) {
  const px = toFiniteNumber(prev.tap_x);
  const py = toFiniteNumber(prev.tap_y);
  const pw = toFiniteNumber(prev.viewport_w);
  const ph = toFiniteNumber(prev.viewport_h);
  const cx = toFiniteNumber(curr.tap_x);
  const cy = toFiniteNumber(curr.tap_y);
  const cw = toFiniteNumber(curr.viewport_w);
  const ch = toFiniteNumber(curr.viewport_h);

  if (
    px === null || py === null || pw === null || ph === null ||
    cx === null || cy === null || cw === null || ch === null ||
    pw === 0 || ph === 0 || cw === 0 || ch === 0
  ) {
    return null;
  }

  const dx = cx / cw - px / pw;
  const dy = cy / ch - py / ph;
  return Math.sqrt(dx * dx + dy * dy);
}

// device_uidが同一の投票グループを created_at 昇順で処理し、
// timeDeltaSec / posDelta / reasons / suspicionScore を付与する。
function annotateGroup(groupVotes) {
  const sorted = [...groupVotes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const reasonSets = sorted.map(() => new Set());
  const timeDeltas = new Array(sorted.length).fill(null);
  const posDeltas = new Array(sorted.length).fill(null);

  // 同じ位置への連続投票のランレングス(グループの先頭でリセット)
  let runStart = 0;
  let runLength = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const timeDeltaSec = (new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime()) / 1000;
    timeDeltas[i] = timeDeltaSec;

    const posDelta = computePosDelta(prev, curr);
    posDeltas[i] = posDelta;

    if (posDelta !== null && posDelta < POSITION_THRESHOLD) {
      runLength += 1;
    } else {
      runStart = i;
      runLength = 1;
    }

    if (runLength >= MIN_RUN_LENGTH) {
      for (let j = runStart; j <= i; j += 1) {
        reasonSets[j].add('same_position_streak');
      }
    }

    if (timeDeltaSec !== null && timeDeltaSec < TIME_THRESHOLD_SEC) {
      reasonSets[i].add('rapid_fire');
    }
  }

  return sorted.map((vote, i) => {
    const reasons = Array.from(reasonSets[i]);
    let suspicionScore = 0;
    if (reasons.includes('same_position_streak')) suspicionScore += 2;
    if (reasons.includes('rapid_fire')) suspicionScore += 1;

    return {
      ...vote,
      timeDeltaSec: timeDeltas[i],
      posDelta: posDeltas[i],
      reasons,
      suspicionScore,
    };
  });
}

// votes: {id, venue_id, voter_type, score, tap_x, tap_y, viewport_w, viewport_h,
//         user_agent, device_uid, created_at} の配列(MySQLの行そのまま)
// device_uidごとにグループ化し、不正投票の兆候(同一位置への連続投票・連続投票の速さ)を注釈する。
function annotateVotes(votes) {
  const grouped = new Map();
  const annotated = [];

  for (const vote of votes) {
    if (vote.device_uid === null || vote.device_uid === undefined) {
      annotated.push({
        ...vote,
        timeDeltaSec: null,
        posDelta: null,
        reasons: [],
        suspicionScore: 0,
      });
      continue;
    }
    if (!grouped.has(vote.device_uid)) {
      grouped.set(vote.device_uid, []);
    }
    grouped.get(vote.device_uid).push(vote);
  }

  for (const groupVotes of grouped.values()) {
    annotated.push(...annotateGroup(groupVotes));
  }

  return annotated;
}

module.exports = {
  POSITION_THRESHOLD,
  TIME_THRESHOLD_SEC,
  MIN_RUN_LENGTH,
  annotateVotes,
};
