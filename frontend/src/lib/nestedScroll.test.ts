import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canScrollInDirection,
  findNestedScrollRegion,
  resolveMainScrollWheelDecision,
} from './nestedScroll.js';

type MockScrollElement = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  overflowY: string;
  attrs: Set<string>;
  parent: MockScrollElement | null;
};

function createTree() {
  const mainMock: MockScrollElement = {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 300,
    overflowY: 'auto',
    attrs: new Set(['data-scroll-region']),
    parent: null,
  };
  const nestedMock: MockScrollElement = {
    scrollTop: 0,
    clientHeight: 50,
    scrollHeight: 120,
    overflowY: 'auto',
    attrs: new Set(['data-scroll-region']),
    parent: mainMock,
  };
  const leafMock: MockScrollElement = {
    scrollTop: 0,
    clientHeight: 10,
    scrollHeight: 10,
    overflowY: 'visible',
    attrs: new Set(),
    parent: nestedMock,
  };

  const cache = new Map<MockScrollElement, HTMLElement>();
  const getElement = (mock: MockScrollElement): HTMLElement => {
    const cached = cache.get(mock);
    if (cached) return cached;

    const element = {
      nodeType: 1,
      get scrollTop() {
        return mock.scrollTop;
      },
      set scrollTop(value: number) {
        mock.scrollTop = value;
      },
      get clientHeight() {
        return mock.clientHeight;
      },
      get scrollHeight() {
        return mock.scrollHeight;
      },
      overflowY: mock.overflowY,
      hasAttribute: (name: string) => mock.attrs.has(name),
      get parentElement() {
        return mock.parent ? getElement(mock.parent) : null;
      },
      children: [],
    } as unknown as HTMLElement;

    cache.set(mock, element);
    return element;
  };

  return {
    main: getElement(mainMock),
    nested: getElement(nestedMock),
    leaf: getElement(leafMock),
    mainMock,
    nestedMock,
  };
}

function createTreeWithPane() {
  const mainMock: MockScrollElement = {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 300,
    overflowY: 'auto',
    attrs: new Set(['data-scroll-region']),
    parent: null,
  };
  const paneMock: MockScrollElement = {
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 400,
    overflowY: 'auto',
    attrs: new Set(['data-scroll-region', 'data-scroll-pane']),
    parent: mainMock,
  };
  const nestedMock: MockScrollElement = {
    scrollTop: 0,
    clientHeight: 50,
    scrollHeight: 120,
    overflowY: 'auto',
    attrs: new Set(['data-scroll-region', 'data-scroll-secondary']),
    parent: paneMock,
  };
  const leafMock: MockScrollElement = {
    scrollTop: 0,
    clientHeight: 10,
    scrollHeight: 10,
    overflowY: 'visible',
    attrs: new Set(),
    parent: nestedMock,
  };

  const cache = new Map<MockScrollElement, HTMLElement>();
  const getElement = (mock: MockScrollElement): HTMLElement => {
    const cached = cache.get(mock);
    if (cached) return cached;

    const element = {
      nodeType: 1,
      get scrollTop() {
        return mock.scrollTop;
      },
      set scrollTop(value: number) {
        mock.scrollTop = value;
      },
      get clientHeight() {
        return mock.clientHeight;
      },
      get scrollHeight() {
        return mock.scrollHeight;
      },
      overflowY: mock.overflowY,
      hasAttribute: (name: string) => mock.attrs.has(name),
      get parentElement() {
        return mock.parent ? getElement(mock.parent) : null;
      },
      children: [],
    } as unknown as HTMLElement;

    cache.set(mock, element);
    return element;
  };

  return {
    main: getElement(mainMock),
    pane: getElement(paneMock),
    leaf: getElement(leafMock),
  };
}

describe('nestedScroll', () => {
  const originalGetComputedStyle = globalThis.getComputedStyle;

  before(() => {
    globalThis.getComputedStyle = ((element: Element) => {
      const source = element as unknown as { overflowY?: string };
      return { overflowY: source.overflowY ?? 'visible' } as CSSStyleDeclaration;
    }) as typeof getComputedStyle;
  });

  after(() => {
    globalThis.getComputedStyle = originalGetComputedStyle;
  });

  it('encuentra la region anidada mas cercana al target', () => {
    const { main, nested, leaf } = createTree();
    assert.equal(findNestedScrollRegion(leaf, main), nested);
    assert.equal(findNestedScrollRegion(main, main), null);
  });

  it('delega al main cuando aun puede desplazarse hacia abajo', () => {
    const { main, leaf } = createTree();
    const decision = resolveMainScrollWheelDecision(leaf, main, 40);
    assert.equal(decision.action, 'delegate');
    if (decision.action === 'delegate') {
      assert.equal(decision.deltaY, 40);
      assert.equal(decision.target, main);
    }
  });

  it('mantiene scroll local cuando el main ya no puede y el anidado si', () => {
    const { main, leaf, mainMock } = createTree();
    mainMock.scrollTop = 200;

    const decision = resolveMainScrollWheelDecision(leaf, main, 40);
    assert.deepEqual(decision, { action: 'default' });
  });

  it('respeta data-scroll-local', () => {
    const { main, leaf, nestedMock } = createTree();
    nestedMock.attrs.add('data-scroll-local');

    const decision = resolveMainScrollWheelDecision(leaf, main, 40);
    assert.deepEqual(decision, { action: 'ignore' });
  });

  it('no usa scroll anidado secundario si el main aun puede desplazarse', () => {
    const { main, leaf, nestedMock } = createTree();
    nestedMock.attrs.add('data-scroll-secondary');

    const decision = resolveMainScrollWheelDecision(leaf, main, 40);
    assert.equal(decision.action, 'delegate');
    if (decision.action === 'delegate') {
      assert.equal(decision.target, main);
    }
  });

  it('delega al panel intermedio cuando existe data-scroll-pane', () => {
    const { main, pane, leaf } = createTreeWithPane();
    const decision = resolveMainScrollWheelDecision(leaf, main, 40);
    assert.equal(decision.action, 'delegate');
    if (decision.action === 'delegate') {
      assert.equal(decision.target, pane);
    }
  });

  it('detecta si un contenedor puede seguir desplazandose', () => {
    const { main, mainMock } = createTree();
    assert.equal(canScrollInDirection(main, 10), true);
    mainMock.scrollTop = 200;
    assert.equal(canScrollInDirection(main, 10), false);
    assert.equal(canScrollInDirection(main, -10), true);
  });
});
