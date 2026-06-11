import {
  isVerifactuModuleLicensed,
  resolveWorkspaceVerifactuEnabled,
} from '@shared/types';
import { config } from '../config.js';

export function isVerifactuModuleLicensedInDeployment(): boolean {
  return isVerifactuModuleLicensed(config.verifactuModuleEnabled);
}

export function effectiveWorkspaceVerifactuEnabled(storedEnabled: boolean): boolean {
  return resolveWorkspaceVerifactuEnabled(storedEnabled, isVerifactuModuleLicensedInDeployment());
}

export function assertVerifactuModuleLicensed(): void {
  if (!isVerifactuModuleLicensedInDeployment()) {
    throw new Error('VERIFACTU_MODULE_NOT_LICENSED');
  }
}
