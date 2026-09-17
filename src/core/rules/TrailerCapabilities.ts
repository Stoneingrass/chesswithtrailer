import type { RuleSet } from './RuleSet';
import type { Square } from '../types';
import type { TrailerOptions } from '../trailer/types';

export interface TrailerCapabilities {
  getProtectors(square: Square): Square[];
  getDirectProtectors(square: Square): Square[];
  getCastlingAssociatedSquares(square: Square): Square[];
  getTrailerOptions(): TrailerOptions;
  setTrailerOptions(partial: Partial<TrailerOptions>): void;
}

export function isTrailerRules(rules: RuleSet): rules is RuleSet & TrailerCapabilities {
  return (
    'getProtectors' in rules &&
    typeof (rules as unknown as TrailerCapabilities).getProtectors === 'function' &&
    'getDirectProtectors' in rules &&
    typeof (rules as unknown as TrailerCapabilities).getDirectProtectors === 'function' &&
    'getCastlingAssociatedSquares' in rules &&
    typeof (rules as unknown as TrailerCapabilities).getCastlingAssociatedSquares === 'function' &&
    'getTrailerOptions' in rules &&
    typeof (rules as unknown as TrailerCapabilities).getTrailerOptions === 'function' &&
    'setTrailerOptions' in rules &&
    typeof (rules as unknown as TrailerCapabilities).setTrailerOptions === 'function'
  );
}
