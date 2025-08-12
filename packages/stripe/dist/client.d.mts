import { stripe } from './index.mjs';
import 'better-auth';
import 'better-call';
import 'stripe';
import 'zod/v4';
import 'better-auth/api';

declare const stripeClient: <O extends {
    subscription: boolean;
}>(options?: O) => {
    id: "stripe-client";
    $InferServerPlugin: ReturnType<typeof stripe<O["subscription"] extends true ? {
        stripeClient: any;
        stripeWebhookSecret: string;
        subscription: {
            enabled: true;
            plans: [];
        };
    } : {
        stripeClient: any;
        stripeWebhookSecret: string;
    }>>;
    pathMethods: {
        "/subscription/restore": "POST";
    };
};

export { stripeClient };
