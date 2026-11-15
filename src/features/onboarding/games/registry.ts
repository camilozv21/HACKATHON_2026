import { CloudSun, Droplets, Satellite, ScanEye, Scale, Snowflake, Wind, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import AnomalyGame from './AnomalyGame';
import BalanceGame from './BalanceGame';
import type { GameId } from './catalog';
import EtGame from './EtGame';
import FrostGame from './FrostGame';
import NdviGame from './NdviGame';
import SeasonGame from './SeasonGame';
import SensorsGame from './SensorsGame';
import type { GameProps } from './ui';

/** Componente de cada reto (lo usan el inicio tipo juego y la práctica de la AgroAcademy). */
export const GAME_COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  ndvi: NdviGame,
  et: EtGame,
  balance: BalanceGame,
  anomaly: AnomalyGame,
  frost: FrostGame,
  sensors: SensorsGame,
  season: SeasonGame,
};

export const GAME_ICONS: Record<GameId, LucideIcon> = {
  ndvi: ScanEye,
  et: Wind,
  balance: Scale,
  anomaly: Droplets,
  frost: Snowflake,
  sensors: Satellite,
  season: CloudSun,
};
