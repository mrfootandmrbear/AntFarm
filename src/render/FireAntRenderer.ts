import { AntKind } from '../sim/constants';
import type { Ant } from '../sim/Ant';
import { AntSpeciesRenderer, type AntSpecies } from './CreatureRenderer';

/**
 * Fire ants: smaller source art than the harvester sheet, and cooled slightly
 * so the two colonies read apart at a glance. Falls back to harvester frames
 * when the fire sheet is missing.
 */
export class FireAntRenderer extends AntSpeciesRenderer {
  protected readonly species: AntSpecies = {
    walkPrefixes: ['fire-ant-walk-', 'ant-walk-'],
    carryPrefixes: ['fire-ant-carry-', 'ant-carry-'],
    spriteCells: 3.0,
    sourcePixels: 70,
    tint: 0xb8b0b0,
    fallbackTint: 0x2a1814,
    fallbackCarryTint: 0xdca028,
  };

  protected owns(ant: Ant): boolean {
    return ant.kind === AntKind.FIRE;
  }
}
