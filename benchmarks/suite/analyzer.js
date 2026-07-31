const space = c => c === 32 || c === 9 || c === 10 || c === 13;
const digit = c => c >= 48 && c <= 57;
const alpha = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95;
const word = c => alpha(c) || digit(c);
const mix = (hash, value) => Math.imul(hash ^ value, 16777619);

function hashForward(text) {
  let hash = 305419896;
  for (let i = 0; i < text.length; i++) hash = mix(hash, text.charCodeAt(i));
  return hash;
}
function hashStride(text) {
  let hash = 18652613;
  for (let i = 0; i < text.length; i += 7) hash = mix(hash, text.charCodeAt(i) + i);
  return hash;
}
function countLines(text) {
  let count = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) count++;
  return count;
}
function countWords(text) {
  let count = 0, inside = false;
  for (let i = 0; i < text.length; i++) {
    const current = word(text.charCodeAt(i));
    if (current && !inside) count++;
    inside = current;
  }
  return count;
}
function longestWord(text) {
  let longest = 0, current = 0;
  for (let i = 0; i < text.length; i++) {
    if (word(text.charCodeAt(i))) {
      current++;
      if (current > longest) longest = current;
    } else current = 0;
  }
  return longest;
}
function countNumbers(text) {
  let count = 0, inside = false;
  for (let i = 0; i < text.length; i++) {
    const current = digit(text.charCodeAt(i));
    if (current && !inside) count++;
    inside = current;
  }
  return count;
}
function sumNumbers(text) {
  let total = 0, value = 0, inside = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (digit(c)) {
      value = (Math.imul(value, 10) + c - 48) | 0;
      inside = true;
    } else {
      if (inside) total = (total + value) | 0;
      value = 0;
      inside = false;
    }
  }
  if (inside) total = (total + value) | 0;
  return total;
}
function countStrings(text) {
  let count = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (quoted) {
      if (escaped) escaped = false;
      else {
        if (c === 92) escaped = true;
        if (c === 34) quoted = false;
      }
    } else if (c === 34) {
      quoted = true;
      count++;
    }
  }
  return count;
}
function countComments(text) {
  let count = 0;
  for (let i = 0; i + 1 < text.length; i++) {
    const a = text.charCodeAt(i), b = text.charCodeAt(i + 1);
    if (a === 47 && (b === 47 || b === 42)) count++;
  }
  return count;
}
function bracketScore(text) {
  let round = 0, square = 0, curly = 0, penalty = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 40) round++;
    if (c === 41 && --round < 0) { penalty++; round = 0; }
    if (c === 91) square++;
    if (c === 93 && --square < 0) { penalty++; square = 0; }
    if (c === 123) curly++;
    if (c === 125 && --curly < 0) { penalty++; curly = 0; }
  }
  return round * 3 + square * 5 + curly * 7 + penalty * 11;
}
function countOperators(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 43 || c === 45 || c === 42 || c === 47 || c === 61 || c === 60 || c === 62) count++;
  }
  return count;
}
function countPatterns(text) {
  let count = 0;
  for (let i = 0; i + 2 < text.length; i++) {
    const a = text.charCodeAt(i), b = text.charCodeAt(i + 1), c = text.charCodeAt(i + 2);
    if (a === 108 && b === 101 && c === 116) count += 3;
    if (a === 102 && b === 110 && space(c)) count += 5;
    if (a === 105 && b === 102 && space(c)) count += 7;
    if (a === 102 && b === 111 && c === 114) count += 11;
  }
  return count;
}
function histogramScore(text) {
  const bins = new Int32Array(128);
  for (let i = 0; i < text.length; i++) bins[text.charCodeAt(i) & 127]++;
  let score = 0;
  for (let i = 0; i < 128; i++) score = mix(score, bins[i] + i);
  return score;
}
function transitionScore(text) {
  let score = 0, previous = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    score = (score + Math.imul(previous ^ c, i & 15)) | 0;
    previous = c;
  }
  return score;
}

export function run(text) {
  const report = {
    hash: hashForward(text), strideHash: hashStride(text), lines: countLines(text),
    words: countWords(text), longest: longestWord(text), numbers: countNumbers(text),
    numberSum: sumNumbers(text), strings: countStrings(text), comments: countComments(text),
    brackets: bracketScore(text), operators: countOperators(text), patterns: countPatterns(text),
    histogram: histogramScore(text), transitions: transitionScore(text),
  };
  let result = report.hash;
  result = mix(result, report.strideHash);
  result = mix(result, report.lines);
  result = mix(result, report.words);
  result = mix(result, report.longest);
  result = mix(result, report.numbers);
  result = mix(result, report.numberSum);
  result = mix(result, report.strings);
  result = mix(result, report.comments);
  result = mix(result, report.brackets);
  result = mix(result, report.operators);
  result = mix(result, report.patterns);
  result = mix(result, report.histogram);
  return mix(result, report.transitions);
}
