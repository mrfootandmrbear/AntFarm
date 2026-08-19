import { AntKind } from '../sim/constants';
import type { Ant } from '../sim/Ant';
import { AntSpeciesRenderer, type AntSpecies } from './CreatureRenderer';

/** Harvester ants: the default colony — dark bodies, art untinted. */
export class HarvesterRenderer extends AntSpeciesRenderer {
  protected readonly species: AntSpecies = {
    walkPrefixes: ['ant-walk-'],
    carryPrefixes: ['ant-carry-'],
    spriteCells: 3.25,
    sourcePixels: 110,
    tint: 0xffffff,
    fallbackTint: 0x1e140f,
    fallbackCarryTint: 0xdca028,
  };

  protected owns(ant: Ant): boolean {
    return ant.kind !== AntKind.FIRE;
  }
}
