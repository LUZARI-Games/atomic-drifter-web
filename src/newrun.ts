// New Run screen – see src/ui/newrun.ts. Left / top: the hangar (ship selection, src/ui/hangar.ts);
// right / bottom: the New Run terminal sliding in.
import './ui/styles.css';
import { mountHangar } from './ui/hangar';
import { mountNewRun } from './ui/newrun';

const hangar = mountHangar(document.getElementById('hangar')!);
mountNewRun(document.getElementById('screen')!, document.getElementById('hud')!, {
  shipLocked: hangar.locked,
  onLockedStart: hangar.deny,
  onStart: hangar.commit,
});
