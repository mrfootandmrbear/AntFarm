/**
 * First-load question: pick up the world that was left running, or start a new one.
 *
 * Only shown when a usable save exists. No engine terminology — the player is
 * choosing between "the world I left" and "a fresh one".
 */
import type { SaveSummary } from '../save/SaveStore';

export type StartChoice = 'continue' | 'new';

function ago(savedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (seconds < 60) return 'moments ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function askStartChoice(summary: SaveSummary): Promise<StartChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'start-overlay';

    const card = document.createElement('div');
    card.className = 'start-card';
    overlay.appendChild(card);

    const title = document.createElement('h1');
    title.className = 'start-title';
    title.textContent = 'Your world is still here';
    card.appendChild(title);

    const detail = document.createElement('p');
    detail.className = 'start-detail';
    const creatures = summary.ants + summary.lizards;
    detail.textContent =
      `Last seen ${ago(summary.savedAt)} — ${summary.ants} ant${summary.ants === 1 ? '' : 's'}` +
      (summary.lizards > 0
        ? `, ${summary.lizards} lizard${summary.lizards === 1 ? '' : 's'}`
        : '') +
      (creatures === 0 ? ' — nothing left alive' : '') +
      `, ${summary.tickCount.toLocaleString()} moments lived.`;
    card.appendChild(detail);

    const row = document.createElement('div');
    row.className = 'start-actions';
    card.appendChild(row);

    const finish = (choice: StartChoice) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(choice);
    };

    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn start-primary';
    continueBtn.textContent = 'Continue';
    continueBtn.addEventListener('click', () => finish('continue'));
    row.appendChild(continueBtn);

    const newBtn = document.createElement('button');
    newBtn.className = 'btn';
    newBtn.textContent = 'New world';
    newBtn.addEventListener('click', () => finish('new'));
    row.appendChild(newBtn);

    const warning = document.createElement('p');
    warning.className = 'start-warning';
    warning.textContent = 'A new world replaces this one.';
    card.appendChild(warning);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finish('continue');
      else if (e.key === 'Escape') finish('new');
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    continueBtn.focus();
  });
}
