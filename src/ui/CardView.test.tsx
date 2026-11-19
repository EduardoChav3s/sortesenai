import { fireEvent, render, screen, within } from '@testing-library/react';
import { CardView } from './CardView';

const card = { id: 'c1', odds_n: 400_000_000, active: true, title: 'Predador', joke: 'Cuidado com ele...' };
const owned = { owned: true as const, quantity: 1, card: { ...card, image_url: '/cards/predador.webp' } };

// jsdom has no PointerEvent: a stand-in so the tests can tell a mouse from a finger
class FakePointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? '';
  }
}

describe('the bigger copy while the mouse is over a card', () => {
  const bigCopy = () => document.body.querySelector<HTMLElement>('[data-card-zoom]');
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', window.PointerEvent ?? FakePointerEvent);
    // a small album card on screen (jsdom has no layout)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 100, left: 100, top: 100, width: 143, height: 200, right: 243, bottom: 300, toJSON: () => ({}) } as DOMRect);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('shows the card bigger, joke included, and hides it when the mouse leaves', () => {
    render(<CardView entry={owned} size="s" />);
    expect(screen.queryByText('Cuidado com ele...')).toBeNull(); // the small card has no room for the joke
    fireEvent.pointerEnter(screen.getByRole('article'), { pointerType: 'mouse' });
    expect(bigCopy()).not.toBeNull();
    expect(within(bigCopy()!).getByText('Cuidado com ele...')).toBeInTheDocument();
    fireEvent.pointerLeave(screen.getByRole('article'), { pointerType: 'mouse' });
    expect(bigCopy()).toBeNull();
  });

  test('closes when the page scrolls, since the copy stays still and the card moves', () => {
    render(<CardView entry={owned} size="s" />);
    fireEvent.pointerEnter(screen.getByRole('article'), { pointerType: 'mouse' });
    expect(bigCopy()).not.toBeNull();
    fireEvent.scroll(window);
    expect(bigCopy()).toBeNull();
  });

  test('a finger on a phone does not open it', () => {
    render(<CardView entry={owned} size="s" />);
    fireEvent.pointerEnter(screen.getByRole('article'), { pointerType: 'touch' });
    expect(bigCopy()).toBeNull();
  });

  test('an empty album slot never opens it', () => {
    render(<CardView entry={{ owned: false, quantity: 0, card: { id: 'c1', odds_n: 400_000_000, active: true } }} size="s" />);
    fireEvent.pointerEnter(screen.getByRole('article'), { pointerType: 'mouse' });
    expect(bigCopy()).toBeNull();
  });

  test('can be turned off, for cards that move or are only decoration', () => {
    render(<CardView entry={owned} size="s" zoom={false} />);
    fireEvent.pointerEnter(screen.getByRole('article'), { pointerType: 'mouse' });
    expect(bigCopy()).toBeNull();
  });
});

test('an owned card with a photo shows the photo', () => {
  render(<CardView entry={{ owned: true, quantity: 1, card: { ...card, image_url: '/cards/predador.webp' } }} />);
  expect(screen.getByRole('img', { name: 'Predador' })).toHaveAttribute('src', '/cards/predador.webp');
});

test('an owned card without a photo shows no image', () => {
  render(<CardView entry={{ owned: true, quantity: 1, card: { ...card, image_url: null } }} />);
  expect(screen.queryByRole('img', { name: 'Predador' })).toBeNull();
});

test('a locked card never shows the photo or the title', () => {
  render(<CardView entry={{ owned: false, quantity: 0, card: { id: 'c1', odds_n: 400_000_000, active: true } }} />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByText('Predador')).toBeNull();
});
