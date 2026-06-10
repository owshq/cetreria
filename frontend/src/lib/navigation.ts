export type ReturnNavigationState = {
  returnTo: string;
};

export function navigationStateForReturn(returnTo: string): ReturnNavigationState {
  return { returnTo };
}

export function getReturnPath(state: unknown, fallback = '/clients'): string {
  if (
    state &&
    typeof state === 'object' &&
    'returnTo' in state &&
    typeof (state as ReturnNavigationState).returnTo === 'string'
  ) {
    return (state as ReturnNavigationState).returnTo;
  }
  return fallback;
}
