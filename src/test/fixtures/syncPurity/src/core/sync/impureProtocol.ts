// Deliberately breaks `logic-is-pure` (src/core/boundaries.test.ts cruises this folder as if it were the project
// root): protocol code of src/core/sync/ must not reach Dexie.
import Dexie from 'dexie';

export const impure = Dexie.name;
