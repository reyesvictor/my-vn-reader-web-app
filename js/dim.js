// Night dim (#37): one global level (not per book, it depends on the room), kept in kv. 0 = off, max 80 %.
import { get, put } from './store/db.js';

let level = 0;
const apply = () => { document.getElementById('dim').style.opacity = level / 100; };
export const dimLevel = () => level;
export async function loadDim() { level = (await get('kv', 'dim')) || 0; apply(); }
export function setDim(v) { level = Math.max(0, Math.min(80, v)); apply(); put('kv', 'dim', level); }
