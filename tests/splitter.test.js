// Run: npm test   (or: node tests/splitter.test.js)
import assert from 'node:assert/strict';
import { splitParagraph } from '../js/core/splitter.js';

const nb = '\u00a0';
const cases = [
  // #1 capitals / abbreviations
  ['Rapport du directeur, M. Alphonse Bérenger. Il pleut.', ['Rapport du directeur, M. Alphonse Bérenger.', 'Il pleut.']],
  ['À l’attention de J. B. Marin. Objet : rien.', ['À l’attention de J. B. Marin.', 'Objet : rien.']],
  ['It echoes W. G. Sebald. Then Kundera.', ['It echoes W. G. Sebald.', 'Then Kundera.']],
  ['Mme Dupont et le Dr. House arrivent. Fin.', ['Mme Dupont et le Dr. House arrivent.', 'Fin.']],
  // #26 #34 etc.
  ['Des dossiers, des photos, etc. Personne ne range.', ['Des dossiers, des photos, etc. Personne ne range.']],
  // #7 #10 quotes
  [`« Tu crois qu’il viendra${nb}? » demanda M. Bérenger. Il pleuvait.`, [`« Tu crois qu’il viendra${nb}? » demanda M. Bérenger.`, 'Il pleuvait.']],
  [`Il murmura${nb}: « Il viendra. Ils viennent toujours${nb}! » Puis il sortit.`, [`Il murmura${nb}: « Il viendra. Ils viennent toujours${nb}! »`, 'Puis il sortit.']],
  [`« Surtout ne pas courir ! » Il ne s’arrêta qu’au parc.`, [`« Surtout ne pas courir ! »`, 'Il ne s’arrêta qu’au parc.']],
  ['“Do you think he knows?” asked Marin. Nobody answered.', ['“Do you think he knows?” asked Marin.', 'Nobody answered.']],
  ['„Ein Test. Noch einer.“ Dann Stille.', ['„Ein Test. Noch einer.“', 'Dann Stille.']],
  ['He said "Stop. Now." Then left.', ['He said "Stop. Now."', 'Then left.']],
  // misc
  ['Ah ! fit-il. Oui.', ['Ah ! fit-il.', 'Oui.']],
  ['Il attendit... Rien. Puis…', ['Il attendit...', 'Rien.', 'Puis…']],
  ['Pi vaut 3.14 environ. Voilà.', ['Pi vaut 3.14 environ.', 'Voilà.']],
  ['— Oui. — Non.', ['— Oui.', '— Non.']],
  ['Sans ponctuation finale', ['Sans ponctuation finale']],
];

let fail = 0;
for (const [input, expected] of cases) {
  try { assert.deepEqual(splitParagraph(input), expected); }
  catch { fail++; console.log('FAIL', JSON.stringify(input), '\n  got     ', JSON.stringify(splitParagraph(input)), '\n  expected', JSON.stringify(expected)); }
}
// Long quote may be split (#7: "if the sentence in the quotes is too long you can break it")
const long = '« ' + 'Une phrase assez longue pour remplir la ligne. '.repeat(10) + '»';
const parts = splitParagraph(long);
if (parts.length < 2) { fail++; console.log('FAIL long quote was not split'); }

console.log(fail ? `${fail} failing` : `all ${cases.length + 1} splitter tests pass`);
process.exit(fail ? 1 : 0);
