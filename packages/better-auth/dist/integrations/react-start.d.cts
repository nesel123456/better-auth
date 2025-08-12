import * as better_call from 'better-call';
import { H as HookEndpointContext } from '../shared/better-auth.CAmMIfb2.cjs';
import 'kysely';
import 'zod/v4';
import '../shared/better-auth.BDR52Rf2.cjs';
import '../shared/better-auth.DeahYwp5.cjs';
import 'jose';
import 'zod/v4/core';
import 'zod';
import 'better-sqlite3';
import 'bun:sqlite';

declare const reactStartCookies: () => {
    id: "react-start-cookies";
    hooks: {
        after: {
            matcher(ctx: HookEndpointContext): true;
            handler: (inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>;
        }[];
    };
};

export { reactStartCookies };
