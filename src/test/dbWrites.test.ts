import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../core/db';
import { writesLeftByTest } from './dbWrites';

// The guard of `src/test/setup.ts` (#292): what it counts as a write a test left running.
describe('writesLeftByTest', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await writesLeftByTest(); // start each case from a quiet database
  });

  it('names the table of a write that was started and not waited for', async () => {
    void db.settings.put({ key: 'x', value: 1 });
    expect(await writesLeftByTest()).toEqual(['settings']);
    expect(await db.settings.get('x')).toMatchObject({ value: 1 }); // and lets it finish
  });

  it('counts nothing for a write the test waited for', async () => {
    await db.settings.put({ key: 'x', value: 1 });
    expect(await writesLeftByTest()).toEqual([]);
  });

  it('counts nothing for a delete that finds nothing to remove', async () => {
    void db.settings.delete('device.missing');
    expect(await writesLeftByTest()).toEqual([]);
  });

  it('counts a delete that removes a row', async () => {
    await db.settings.put({ key: 'adaptation.morning', value: 1 }); // local-only: removed physically
    void db.settings.delete('adaptation.morning');
    expect(await writesLeftByTest()).toEqual(['settings']);
  });

  it('counts nothing for a write that was rolled back', async () => {
    void db
      .transaction('rw', db.settings, async () => {
        await db.settings.put({ key: 'x', value: 1 });
        throw new Error('rolled back');
      })
      .catch(() => undefined);
    expect(await writesLeftByTest()).toEqual([]);
    expect(await db.settings.get('x')).toBeUndefined();
  });

  it('counts nothing for reads', async () => {
    void db.settings.toArray();
    expect(await writesLeftByTest()).toEqual([]);
  });
});
