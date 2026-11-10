/**
 * Counts changes of the account that local data belongs to (#113): local data cleared, session
 * invalidated, a session adopted. Work that started under an older value (a sync cycle, a
 * site-list refresh waiting on the network or on the auth lock) must not write its result, or
 * the previous account's sync status or sites could come back after a clear.
 * In memory: a worker restart also ends any work in flight.
 */
export function createAccountEpoch() {
  let value = 0;
  return {
    current: () => value,
    bump: () => {
      value += 1;
    },
  };
}

export type AccountEpoch = ReturnType<typeof createAccountEpoch>;
