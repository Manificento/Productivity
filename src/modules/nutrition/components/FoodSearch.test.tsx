import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../core/db';
import { createFood } from '../data/food';
import { SEARCH_DEBOUNCE_MS, clearOffSearchCache } from '../data/openFoodFacts';
import { FoodTab } from './FoodTab';

const TODAY = '2026-11-04';

const OFF_BODY = {
  products: [
    {
      code: '4600000000001',
      product_name: 'Buckwheat',
      product_name_ru: 'Гречка ядрица',
      nutriments: { 'energy-kcal_100g': 313, proteins_100g: 12.6, fat_100g: 3.3, carbohydrates_100g: 57.1 },
    },
    { code: '4600000000002', product_name_ru: 'Гречка без данных', nutriments: { proteins_100g: 10 } },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

function renderTab() {
  render(
    <MemoryRouter>
      <FoodTab today={TODAY} />
    </MemoryRouter>,
  );
}

async function openSearch() {
  fireEvent.click(await screen.findByRole('button', { name: '+ Добавить в «Обед»' }));
  return screen.getByRole('dialog');
}

const search = (value: string) => fireEvent.change(screen.getByLabelText('Поиск продукта'), { target: { value } });

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.mealLogs.clear()]);
  clearOffSearchCache();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(OFF_BODY) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('food search with Open Food Facts', () => {
  it('Given I type «гречка» When 400 ms pass Then my own foods come first, then Open Food Facts results', async () => {
    await createFood({ name: 'Гречка домашняя', kcal: 110, protein: 4, fat: 1, carbs: 21 });
    renderTab();
    const dialog = await openSearch();
    search('гре');
    search('гречка');

    // Own foods are there at once; the API waits for the pause in typing.
    const own = within(dialog).getByRole('region', { name: 'Мои продукты' });
    expect(within(own).getByRole('button', { name: /Гречка домашняя/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const off = await within(dialog).findByRole('list', { name: 'Результаты Open Food Facts' });
    expect(within(off).getByRole('button', { name: /Гречка ядрица/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('search_terms=%D0%B3%D1%80%D0%B5%D1%87%D0%BA%D0%B0');
    // Own section is rendered before the API section.
    expect(own.compareDocumentPosition(off) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the request is sent only after the 400 ms pause', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderTab();
      await vi.waitFor(() => screen.getByRole('button', { name: '+ Добавить в «Обед»' }));
      fireEvent.click(screen.getByRole('button', { name: '+ Добавить в «Обед»' }));
      search('гречка');
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
      expect(fetchMock).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Given an API product without calories When results are shown Then it is skipped', async () => {
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    const off = await within(dialog).findByRole('list', { name: 'Результаты Open Food Facts' });
    expect(within(off).getAllByRole('button')).toHaveLength(1);
    expect(within(dialog).queryByText(/Гречка без данных/)).not.toBeInTheDocument();
  });

  it('Given I pick a product from the API When I add it Then it is cached in foods (source openfoodfacts, externalId) and works offline', async () => {
    renderTab();
    let dialog = await openSearch();
    search('гречка');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Гречка ядрица/ }));
    fireEvent.change(await within(dialog).findByLabelText('Вес, г'), { target: { value: '80' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));

    const lunch = await screen.findByRole('region', { name: 'Обед' });
    expect(await within(lunch).findByText('Гречка ядрица, 80 г')).toBeInTheDocument();
    const [cached] = await db.foods.toArray();
    expect(cached).toMatchObject({
      source: 'openfoodfacts',
      externalId: '4600000000001',
      name: 'Гречка ядрица',
      kcal: 313,
    });

    // A new session, offline: the cached product is still found among my foods.
    clearOffSearchCache();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    dialog = await openSearch();
    search('гречка');
    const own = within(dialog).getByRole('region', { name: 'Мои продукты' });
    expect(within(own).getByRole('button', { name: /Гречка ядрица/ })).toBeInTheDocument();
    expect(await within(dialog).findByText(/Нет сети/)).toBeInTheDocument();
  });

  it('a product already cached is not listed twice', async () => {
    await db.foods.add({
      id: 'cached',
      createdAt: 0,
      updatedAt: 0,
      name: 'Гречка ядрица',
      kcal: 313,
      protein: 12.6,
      fat: 3.3,
      carbs: 57.1,
      source: 'openfoodfacts',
      externalId: '4600000000001',
    });
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    expect(await within(dialog).findByText('В Open Food Facts ничего не нашлось.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: /Гречка ядрица/ })).toHaveLength(1);
  });

  it('picking an API product and going back does not cache it', async () => {
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Гречка ядрица/ }));
    await within(dialog).findByLabelText('Вес, г');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Назад' }));
    expect(await db.foods.count()).toBe(0);
  });

  it('going back to an earlier query reuses its results without a new request', async () => {
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    await within(dialog).findByRole('list', { name: 'Результаты Open Food Facts' });
    search('');
    search('гречка');
    expect(within(dialog).getByRole('list', { name: 'Результаты Open Food Facts' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('when OFF is unreachable while online (rate-limit page without CORS) it says OFF is not responding', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Open Food Facts сейчас не отвечает');
  });

  it('Given no network When I search Then a clear message and the «Создать свой продукт» button are shown', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Нет сети — поиск в Open Food Facts недоступен');
    expect(within(dialog).getByRole('button', { name: 'Создать свой продукт' })).toBeInTheDocument();
  });

  it('when the network comes back the search runs again', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    expect(await within(dialog).findByText(/Нет сети/)).toBeInTheDocument();
    online.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(await within(dialog).findByRole('list', { name: 'Результаты Open Food Facts' })).toBeInTheDocument();
  });

  it('an API error is reported without breaking the search', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    renderTab();
    const dialog = await openSearch();
    search('гречка');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Open Food Facts сейчас не отвечает');
  });

  it('queries shorter than 3 letters are not sent to the API', async () => {
    renderTab();
    await openSearch();
    search('гр');
    await new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50));
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
