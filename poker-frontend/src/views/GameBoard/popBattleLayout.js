import { handSpacing } from '@/layout/hand.js';

export function measurePopBattle(board, hand, count) {
  board.style.setProperty('--pop-hand-height', `${hand.offsetHeight}px`);
  const portrait = board.clientWidth <= 600 && board.clientHeight > board.clientWidth && board.clientHeight >= 650;
  hand.style.setProperty('--hand-columns', Math.min(8, Math.max(7, Math.ceil(count / 2))));
  const card = hand.querySelector('.card');
  if (card && !portrait) {
    const cardWidth = card.getBoundingClientRect().width;
    const fitted = handSpacing(hand.clientWidth - 6,cardWidth,count,cardWidth * .72);
    const step = Math.max(29,fitted.step);
    const width = count ? cardWidth + (count-1) * step : 0;
    hand.style.setProperty('--hand-step', `${step}px`);
    hand.style.setProperty('--hand-width', `${width}px`);
  }
  const arena = board.querySelector('.gb-arena');
  const heading = board.querySelector('.gb-arena-heading');
  const row = board.querySelector('.played-cards .card-display-row');
  const desiredWidth = parseFloat(getComputedStyle(board).getPropertyValue('--pop-table-width')) || 130;
  const display = board.querySelector('.played-cards');
  const phase = board.querySelector('.phase-notice');
  const sideBySide = phase && display && getComputedStyle(display).display === 'grid';
  const caption = sideBySide ? 0 : (phase?.offsetHeight || board.querySelector('.gb-played-owner')?.offsetHeight || 0);
  const gap = sideBySide ? 0 : parseFloat(display && getComputedStyle(display).rowGap) || 0;
  const tableStyle = getComputedStyle(board.querySelector('.gb-table'));
  const padding = parseFloat(tableStyle.paddingTop) + parseFloat(tableStyle.paddingBottom);
  const tableHeight = Math.max(40,Math.min(desiredWidth * 1.4,arena.clientHeight - heading.offsetHeight - caption - gap - padding - 6));
  board.style.setProperty('--table-card-height', `${tableHeight}px`);
  if (row) {
    const {step} = handSpacing(row.clientWidth - 6,tableHeight / 1.4,row.children.length,tableHeight / 1.4 + 8);
    row.style.setProperty('--table-step', `${step}px`);
  }
}
