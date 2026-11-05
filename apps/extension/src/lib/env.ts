/** True only in development builds (`pnpm build`), used to gate debug logging (SEC-06, ENV-10). */
export const IS_DEV_BUILD: boolean = import.meta.env.DEV;
