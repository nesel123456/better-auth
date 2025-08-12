import * as better_auth from 'better-auth';
import { GenericEndpointContext, User, Session, InferOptionSchema } from 'better-auth';
import * as better_call from 'better-call';
import Stripe from 'stripe';
import * as z from 'zod/v4';
import { APIError } from 'better-auth/api';

declare const subscriptions: {
    subscription: {
        fields: {
            plan: {
                type: "string";
                required: true;
            };
            referenceId: {
                type: "string";
                required: true;
            };
            stripeCustomerId: {
                type: "string";
                required: false;
            };
            stripeSubscriptionId: {
                type: "string";
                required: false;
            };
            status: {
                type: "string";
                defaultValue: string;
            };
            periodStart: {
                type: "date";
                required: false;
            };
            periodEnd: {
                type: "date";
                required: false;
            };
            cancelAtPeriodEnd: {
                type: "boolean";
                required: false;
                defaultValue: false;
            };
            seats: {
                type: "number";
                required: false;
            };
        };
    };
};
declare const user: {
    user: {
        fields: {
            stripeCustomerId: {
                type: "string";
                required: false;
            };
        };
    };
};

type StripePlan = {
    /**
     * Monthly price id
     */
    priceId?: string;
    /**
     * To use lookup key instead of price id
     *
     * https://docs.stripe.com/products-prices/
     * manage-prices#lookup-keys
     */
    lookupKey?: string;
    /**
     * A yearly discount price id
     *
     * useful when you want to offer a discount for
     * yearly subscription
     */
    annualDiscountPriceId?: string;
    /**
     * To use lookup key instead of price id
     *
     * https://docs.stripe.com/products-prices/
     * manage-prices#lookup-keys
     */
    annualDiscountLookupKey?: string;
    /**
     * Plan name
     */
    name: string;
    /**
     * Limits for the plan
     */
    limits?: Record<string, number>;
    /**
     * Plan group name
     *
     * useful when you want to group plans or
     * when a user can subscribe to multiple plans.
     */
    group?: string;
    /**
     * Free trial days
     */
    freeTrial?: {
        /**
         * Number of days
         */
        days: number;
        /**
         * A function that will be called when the trial
         * starts.
         *
         * @param subscription
         * @returns
         */
        onTrialStart?: (subscription: Subscription) => Promise<void>;
        /**
         * A function that will be called when the trial
         * ends
         *
         * @param subscription - Subscription
         * @returns
         */
        onTrialEnd?: (data: {
            subscription: Subscription;
        }, ctx: GenericEndpointContext) => Promise<void>;
        /**
         * A function that will be called when the trial
         * expired.
         * @param subscription - Subscription
         * @returns
         */
        onTrialExpired?: (subscription: Subscription, ctx: GenericEndpointContext) => Promise<void>;
    };
};
interface Subscription {
    /**
     * Database identifier
     */
    id: string;
    /**
     * The plan name
     */
    plan: string;
    /**
     * Stripe customer id
     */
    stripeCustomerId?: string;
    /**
     * Stripe subscription id
     */
    stripeSubscriptionId?: string;
    /**
     * Trial start date
     */
    trialStart?: Date;
    /**
     * Trial end date
     */
    trialEnd?: Date;
    /**
     * Price Id for the subscription
     */
    priceId?: string;
    /**
     * To what reference id the subscription belongs to
     * @example
     * - userId for a user
     * - workspace id for a saas platform
     * - website id for a hosting platform
     *
     * @default - userId
     */
    referenceId: string;
    /**
     * Subscription status
     */
    status: "active" | "canceled" | "incomplete" | "incomplete_expired" | "past_due" | "paused" | "trialing" | "unpaid";
    /**
     * The billing cycle start date
     */
    periodStart?: Date;
    /**
     * The billing cycle end date
     */
    periodEnd?: Date;
    /**
     * Cancel at period end
     */
    cancelAtPeriodEnd?: boolean;
    /**
     * A field to group subscriptions so you can have multiple subscriptions
     * for one reference id
     */
    groupId?: string;
    /**
     * Number of seats for the subscription (useful for team plans)
     */
    seats?: number;
}
interface StripeOptions {
    /**
     * Stripe Client
     */
    stripeClient: Stripe;
    /**
     * Stripe Webhook Secret
     *
     * @description Stripe webhook secret key
     */
    stripeWebhookSecret: string;
    /**
     * Enable customer creation when a user signs up
     */
    createCustomerOnSignUp?: boolean;
    /**
     * A callback to run after a customer has been created
     * @param customer - Customer Data
     * @param stripeCustomer - Stripe Customer Data
     * @returns
     */
    onCustomerCreate?: (data: {
        stripeCustomer: Stripe.Customer;
        user: User;
    }, ctx: GenericEndpointContext) => Promise<void>;
    /**
     * A custom function to get the customer create
     * params
     * @param data - data containing user and session
     * @returns
     */
    getCustomerCreateParams?: (data: {
        user: User;
        session: Session;
    }, ctx: GenericEndpointContext) => Promise<{}>;
    /**
     * Subscriptions
     */
    subscription?: {
        enabled: boolean;
        /**
         * Subscription Configuration
         */
        /**
         * List of plan
         */
        plans: StripePlan[] | (() => Promise<StripePlan[]>);
        /**
         * Require email verification before a user is allowed to upgrade
         * their subscriptions
         *
         * @default false
         */
        requireEmailVerification?: boolean;
        /**
         * A callback to run after a user has subscribed to a package
         * @param event - Stripe Event
         * @param subscription - Subscription Data
         * @returns
         */
        onSubscriptionComplete?: (data: {
            event: Stripe.Event;
            stripeSubscription: Stripe.Subscription;
            subscription: Subscription;
            plan: StripePlan;
        }, ctx: GenericEndpointContext) => Promise<void>;
        /**
         * A callback to run after a user is about to cancel their subscription
         * @returns
         */
        onSubscriptionUpdate?: (data: {
            event: Stripe.Event;
            subscription: Subscription;
        }) => Promise<void>;
        /**
         * A callback to run after a user is about to cancel their subscription
         * @returns
         */
        onSubscriptionCancel?: (data: {
            event?: Stripe.Event;
            subscription: Subscription;
            stripeSubscription: Stripe.Subscription;
            cancellationDetails?: Stripe.Subscription.CancellationDetails | null;
        }) => Promise<void>;
        /**
         * A function to check if the reference id is valid
         * and belongs to the user
         *
         * @param data - data containing user, session and referenceId
         * @param ctx - the context object
         * @returns
         */
        authorizeReference?: (data: {
            user: User & Record<string, any>;
            session: Session & Record<string, any>;
            referenceId: string;
            action: "upgrade-subscription" | "list-subscription" | "cancel-subscription" | "restore-subscription" | "billing-portal";
        }, ctx: GenericEndpointContext) => Promise<boolean>;
        /**
         * A callback to run after a user has deleted their subscription
         * @returns
         */
        onSubscriptionDeleted?: (data: {
            event: Stripe.Event;
            stripeSubscription: Stripe.Subscription;
            subscription: Subscription;
        }) => Promise<void>;
        /**
         * parameters for session create params
         *
         * @param data - data containing user, session and plan
         * @param ctx - the context object
         */
        getCheckoutSessionParams?: (data: {
            user: User & Record<string, any>;
            session: Session & Record<string, any>;
            plan: StripePlan;
            subscription: Subscription;
        }, ctx: GenericEndpointContext) => Promise<{
            params?: Stripe.Checkout.SessionCreateParams;
            options?: Stripe.RequestOptions;
        }> | {
            params?: Stripe.Checkout.SessionCreateParams;
            options?: Stripe.RequestOptions;
        };
        /**
         * Enable organization subscription
         */
        organization?: {
            enabled: boolean;
        };
    };
    /**
     * A callback to run after a stripe event is received
     * @param event - Stripe Event
     * @returns
     */
    onEvent?: (event: Stripe.Event) => Promise<void>;
    /**
     * Schema for the stripe plugin
     */
    schema?: InferOptionSchema<typeof subscriptions & typeof user>;
}

declare const stripe: <O extends StripeOptions>(options: O) => {
    id: "stripe";
    endpoints: {
        stripeWebhook: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0?: ({
                body?: undefined;
            } & {
                method?: "POST" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }) | undefined): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: {
                    success: boolean;
                };
            } : {
                success: boolean;
            }>;
            options: {
                method: "POST";
                metadata: {
                    isAction: boolean;
                };
                cloneRequest: true;
            } & {
                use: any[];
            };
            path: "/stripe/webhook";
        };
    } & (O["subscription"] extends {
        enabled: boolean;
    } ? {
        /**
         * ### Endpoint
         *
         * POST `/subscription/upgrade`
         *
         * ### API Methods
         *
         * **server:**
         * `auth.api.upgradeSubscription`
         *
         * **client:**
         * `authClient.subscription.upgrade`
         *
         * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/stripe#api-method-subscription-upgrade)
         */
        readonly upgradeSubscription: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body: {
                    plan: string;
                    annual?: boolean | undefined;
                    referenceId?: string | undefined;
                    subscriptionId?: string | undefined;
                    metadata?: Record<string, any> | undefined;
                    seats?: number | undefined;
                    successUrl?: string | undefined;
                    cancelUrl?: string | undefined;
                    returnUrl?: string | undefined;
                    disableRedirect?: boolean | undefined;
                };
            } & {
                method?: "POST" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: {
                    url: string;
                    redirect: boolean;
                } | {
                    redirect: boolean;
                    id: string;
                    object: "checkout.session";
                    adaptive_pricing: Stripe.Checkout.Session.AdaptivePricing | null;
                    after_expiration: Stripe.Checkout.Session.AfterExpiration | null;
                    allow_promotion_codes: boolean | null;
                    amount_subtotal: number | null;
                    amount_total: number | null;
                    automatic_tax: Stripe.Checkout.Session.AutomaticTax;
                    billing_address_collection: Stripe.Checkout.Session.BillingAddressCollection | null;
                    cancel_url: string | null;
                    client_reference_id: string | null;
                    client_secret: string | null;
                    collected_information: Stripe.Checkout.Session.CollectedInformation | null;
                    consent: Stripe.Checkout.Session.Consent | null;
                    consent_collection: Stripe.Checkout.Session.ConsentCollection | null;
                    created: number;
                    currency: string | null;
                    currency_conversion: Stripe.Checkout.Session.CurrencyConversion | null;
                    custom_fields: Array<Stripe.Checkout.Session.CustomField>;
                    custom_text: Stripe.Checkout.Session.CustomText;
                    customer: string | Stripe.Customer | Stripe.DeletedCustomer | null;
                    customer_creation: Stripe.Checkout.Session.CustomerCreation | null;
                    customer_details: Stripe.Checkout.Session.CustomerDetails | null;
                    customer_email: string | null;
                    discounts: Array<Stripe.Checkout.Session.Discount> | null;
                    expires_at: number;
                    invoice: string | Stripe.Invoice | null;
                    invoice_creation: Stripe.Checkout.Session.InvoiceCreation | null;
                    line_items?: Stripe.ApiList<Stripe.LineItem>;
                    livemode: boolean;
                    locale: Stripe.Checkout.Session.Locale | null;
                    metadata: Stripe.Metadata | null;
                    mode: Stripe.Checkout.Session.Mode;
                    optional_items?: Array<Stripe.Checkout.Session.OptionalItem> | null;
                    payment_intent: string | Stripe.PaymentIntent | null;
                    payment_link: string | Stripe.PaymentLink | null;
                    payment_method_collection: Stripe.Checkout.Session.PaymentMethodCollection | null;
                    payment_method_configuration_details: Stripe.Checkout.Session.PaymentMethodConfigurationDetails | null;
                    payment_method_options: Stripe.Checkout.Session.PaymentMethodOptions | null;
                    payment_method_types: Array<string>;
                    payment_status: Stripe.Checkout.Session.PaymentStatus;
                    permissions: Stripe.Checkout.Session.Permissions | null;
                    phone_number_collection?: Stripe.Checkout.Session.PhoneNumberCollection;
                    presentment_details?: Stripe.Checkout.Session.PresentmentDetails;
                    recovered_from: string | null;
                    redirect_on_completion?: Stripe.Checkout.Session.RedirectOnCompletion;
                    return_url?: string;
                    saved_payment_method_options: Stripe.Checkout.Session.SavedPaymentMethodOptions | null;
                    setup_intent: string | Stripe.SetupIntent | null;
                    shipping_address_collection: Stripe.Checkout.Session.ShippingAddressCollection | null;
                    shipping_cost: Stripe.Checkout.Session.ShippingCost | null;
                    shipping_options: Array<Stripe.Checkout.Session.ShippingOption>;
                    status: Stripe.Checkout.Session.Status | null;
                    submit_type: Stripe.Checkout.Session.SubmitType | null;
                    subscription: string | Stripe.Subscription | null;
                    success_url: string | null;
                    tax_id_collection?: Stripe.Checkout.Session.TaxIdCollection;
                    total_details: Stripe.Checkout.Session.TotalDetails | null;
                    ui_mode: Stripe.Checkout.Session.UiMode | null;
                    url: string | null;
                    wallet_options: Stripe.Checkout.Session.WalletOptions | null;
                    lastResponse: {
                        headers: {
                            [key: string]: string;
                        };
                        requestId: string;
                        statusCode: number;
                        apiVersion?: string;
                        idempotencyKey?: string;
                        stripeAccount?: string;
                    };
                };
            } : {
                url: string;
                redirect: boolean;
            } | {
                redirect: boolean;
                id: string;
                object: "checkout.session";
                adaptive_pricing: Stripe.Checkout.Session.AdaptivePricing | null;
                after_expiration: Stripe.Checkout.Session.AfterExpiration | null;
                allow_promotion_codes: boolean | null;
                amount_subtotal: number | null;
                amount_total: number | null;
                automatic_tax: Stripe.Checkout.Session.AutomaticTax;
                billing_address_collection: Stripe.Checkout.Session.BillingAddressCollection | null;
                cancel_url: string | null;
                client_reference_id: string | null;
                client_secret: string | null;
                collected_information: Stripe.Checkout.Session.CollectedInformation | null;
                consent: Stripe.Checkout.Session.Consent | null;
                consent_collection: Stripe.Checkout.Session.ConsentCollection | null;
                created: number;
                currency: string | null;
                currency_conversion: Stripe.Checkout.Session.CurrencyConversion | null;
                custom_fields: Array<Stripe.Checkout.Session.CustomField>;
                custom_text: Stripe.Checkout.Session.CustomText;
                customer: string | Stripe.Customer | Stripe.DeletedCustomer | null;
                customer_creation: Stripe.Checkout.Session.CustomerCreation | null;
                customer_details: Stripe.Checkout.Session.CustomerDetails | null;
                customer_email: string | null;
                discounts: Array<Stripe.Checkout.Session.Discount> | null;
                expires_at: number;
                invoice: string | Stripe.Invoice | null;
                invoice_creation: Stripe.Checkout.Session.InvoiceCreation | null;
                line_items?: Stripe.ApiList<Stripe.LineItem>;
                livemode: boolean;
                locale: Stripe.Checkout.Session.Locale | null;
                metadata: Stripe.Metadata | null;
                mode: Stripe.Checkout.Session.Mode;
                optional_items?: Array<Stripe.Checkout.Session.OptionalItem> | null;
                payment_intent: string | Stripe.PaymentIntent | null;
                payment_link: string | Stripe.PaymentLink | null;
                payment_method_collection: Stripe.Checkout.Session.PaymentMethodCollection | null;
                payment_method_configuration_details: Stripe.Checkout.Session.PaymentMethodConfigurationDetails | null;
                payment_method_options: Stripe.Checkout.Session.PaymentMethodOptions | null;
                payment_method_types: Array<string>;
                payment_status: Stripe.Checkout.Session.PaymentStatus;
                permissions: Stripe.Checkout.Session.Permissions | null;
                phone_number_collection?: Stripe.Checkout.Session.PhoneNumberCollection;
                presentment_details?: Stripe.Checkout.Session.PresentmentDetails;
                recovered_from: string | null;
                redirect_on_completion?: Stripe.Checkout.Session.RedirectOnCompletion;
                return_url?: string;
                saved_payment_method_options: Stripe.Checkout.Session.SavedPaymentMethodOptions | null;
                setup_intent: string | Stripe.SetupIntent | null;
                shipping_address_collection: Stripe.Checkout.Session.ShippingAddressCollection | null;
                shipping_cost: Stripe.Checkout.Session.ShippingCost | null;
                shipping_options: Array<Stripe.Checkout.Session.ShippingOption>;
                status: Stripe.Checkout.Session.Status | null;
                submit_type: Stripe.Checkout.Session.SubmitType | null;
                subscription: string | Stripe.Subscription | null;
                success_url: string | null;
                tax_id_collection?: Stripe.Checkout.Session.TaxIdCollection;
                total_details: Stripe.Checkout.Session.TotalDetails | null;
                ui_mode: Stripe.Checkout.Session.UiMode | null;
                url: string | null;
                wallet_options: Stripe.Checkout.Session.WalletOptions | null;
                lastResponse: {
                    headers: {
                        [key: string]: string;
                    };
                    requestId: string;
                    statusCode: number;
                    apiVersion?: string;
                    idempotencyKey?: string;
                    stripeAccount?: string;
                };
            }>;
            options: {
                method: "POST";
                body: z.ZodObject<{
                    plan: z.ZodString;
                    annual: z.ZodOptional<z.ZodBoolean>;
                    referenceId: z.ZodOptional<z.ZodString>;
                    subscriptionId: z.ZodOptional<z.ZodString>;
                    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                    seats: z.ZodOptional<z.ZodNumber>;
                    successUrl: z.ZodDefault<z.ZodString>;
                    cancelUrl: z.ZodDefault<z.ZodString>;
                    returnUrl: z.ZodOptional<z.ZodString>;
                    disableRedirect: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strip>;
                use: (((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            userId: string;
                            expiresAt: Date;
                            createdAt: Date;
                            updatedAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            createdAt: Date;
                            updatedAt: Date;
                            image?: string | null | undefined;
                        };
                    };
                }>) | ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>))[];
            } & {
                use: any[];
            };
            path: "/subscription/upgrade";
        };
        readonly cancelSubscriptionCallback: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0?: ({
                body?: undefined;
            } & {
                method?: "GET" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }) | undefined): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: never;
            } : never>;
            options: {
                method: "GET";
                query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                use: ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>)[];
            } & {
                use: any[];
            };
            path: "/subscription/cancel/callback";
        };
        /**
         * ### Endpoint
         *
         * POST `/subscription/cancel`
         *
         * ### API Methods
         *
         * **server:**
         * `auth.api.cancelSubscription`
         *
         * **client:**
         * `authClient.subscription.cancel`
         *
         * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/stripe#api-method-subscription-cancel)
         */
        readonly cancelSubscription: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body: {
                    returnUrl: string;
                    referenceId?: string | undefined;
                    subscriptionId?: string | undefined;
                };
            } & {
                method?: "POST" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: {
                    url: string;
                    redirect: boolean;
                };
            } : {
                url: string;
                redirect: boolean;
            }>;
            options: {
                method: "POST";
                body: z.ZodObject<{
                    referenceId: z.ZodOptional<z.ZodString>;
                    subscriptionId: z.ZodOptional<z.ZodString>;
                    returnUrl: z.ZodString;
                }, z.core.$strip>;
                use: (((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            userId: string;
                            expiresAt: Date;
                            createdAt: Date;
                            updatedAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            createdAt: Date;
                            updatedAt: Date;
                            image?: string | null | undefined;
                        };
                    };
                }>) | ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>))[];
            } & {
                use: any[];
            };
            path: "/subscription/cancel";
        };
        readonly restoreSubscription: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body: {
                    referenceId?: string | undefined;
                    subscriptionId?: string | undefined;
                };
            } & {
                method?: "POST" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: Stripe.Response<Stripe.Subscription>;
            } : Stripe.Response<Stripe.Subscription>>;
            options: {
                method: "POST";
                body: z.ZodObject<{
                    referenceId: z.ZodOptional<z.ZodString>;
                    subscriptionId: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
                use: (((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            userId: string;
                            expiresAt: Date;
                            createdAt: Date;
                            updatedAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            createdAt: Date;
                            updatedAt: Date;
                            image?: string | null | undefined;
                        };
                    };
                }>) | ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>))[];
            } & {
                use: any[];
            };
            path: "/subscription/restore";
        };
        /**
         * ### Endpoint
         *
         * GET `/subscription/list`
         *
         * ### API Methods
         *
         * **server:**
         * `auth.api.listActiveSubscriptions`
         *
         * **client:**
         * `authClient.subscription.list`
         *
         * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/stripe#api-method-subscription-list)
         */
        readonly listActiveSubscriptions: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0?: ({
                body?: undefined;
            } & {
                method?: "GET" | undefined;
            } & {
                query?: {
                    referenceId?: string | undefined;
                } | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }) | undefined): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: {
                    limits: Record<string, number> | undefined;
                    priceId: string | undefined;
                    id: string;
                    plan: string;
                    stripeCustomerId?: string;
                    stripeSubscriptionId?: string;
                    trialStart?: Date;
                    trialEnd?: Date;
                    referenceId: string;
                    status: "active" | "canceled" | "incomplete" | "incomplete_expired" | "past_due" | "paused" | "trialing" | "unpaid";
                    periodStart?: Date;
                    periodEnd?: Date;
                    cancelAtPeriodEnd?: boolean;
                    groupId?: string;
                    seats?: number;
                }[];
            } : {
                limits: Record<string, number> | undefined;
                priceId: string | undefined;
                id: string;
                plan: string;
                stripeCustomerId?: string;
                stripeSubscriptionId?: string;
                trialStart?: Date;
                trialEnd?: Date;
                referenceId: string;
                status: "active" | "canceled" | "incomplete" | "incomplete_expired" | "past_due" | "paused" | "trialing" | "unpaid";
                periodStart?: Date;
                periodEnd?: Date;
                cancelAtPeriodEnd?: boolean;
                groupId?: string;
                seats?: number;
            }[]>;
            options: {
                method: "GET";
                query: z.ZodOptional<z.ZodObject<{
                    referenceId: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                use: (((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            userId: string;
                            expiresAt: Date;
                            createdAt: Date;
                            updatedAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            createdAt: Date;
                            updatedAt: Date;
                            image?: string | null | undefined;
                        };
                    };
                }>) | ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>))[];
            } & {
                use: any[];
            };
            path: "/subscription/list";
        };
        readonly subscriptionSuccess: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0?: ({
                body?: undefined;
            } & {
                method?: "GET" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }) | undefined): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: APIError;
            } : APIError>;
            options: {
                method: "GET";
                query: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                use: ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>)[];
            } & {
                use: any[];
            };
            path: "/subscription/success";
        };
        readonly createBillingPortal: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body: {
                    referenceId?: string | undefined;
                    returnUrl?: string | undefined;
                };
            } & {
                method?: "POST" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params?: Record<string, any>;
            } & {
                request?: Request;
            } & {
                headers?: HeadersInit;
            } & {
                asResponse?: boolean;
                returnHeaders?: boolean;
                use?: better_call.Middleware[];
                path?: string;
            } & {
                asResponse?: AsResponse | undefined;
                returnHeaders?: ReturnHeaders | undefined;
            }): Promise<[AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
                headers: Headers;
                response: {
                    url: string;
                    redirect: boolean;
                };
            } : {
                url: string;
                redirect: boolean;
            }>;
            options: {
                method: "POST";
                body: z.ZodObject<{
                    referenceId: z.ZodOptional<z.ZodString>;
                    returnUrl: z.ZodDefault<z.ZodString>;
                }, z.core.$strip>;
                use: (((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<{
                    session: {
                        session: Record<string, any> & {
                            id: string;
                            userId: string;
                            expiresAt: Date;
                            createdAt: Date;
                            updatedAt: Date;
                            token: string;
                            ipAddress?: string | null | undefined;
                            userAgent?: string | null | undefined;
                        };
                        user: Record<string, any> & {
                            id: string;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            createdAt: Date;
                            updatedAt: Date;
                            image?: string | null | undefined;
                        };
                    };
                }>) | ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<void>))[];
            } & {
                use: any[];
            };
            path: "/subscription/billing-portal";
        };
    } : {});
    init(ctx: better_auth.AuthContext): {
        options: {
            databaseHooks: {
                user: {
                    create: {
                        after(user: {
                            id: string;
                            email: string;
                            emailVerified: boolean;
                            name: string;
                            createdAt: Date;
                            updatedAt: Date;
                            image?: string | null | undefined;
                        } & Record<string, unknown>, ctx: GenericEndpointContext | undefined): Promise<void>;
                    };
                };
            };
        };
    };
    schema: {
        user: {
            fields: {
                stripeCustomerId: {
                    type: "string";
                    required: false;
                };
            };
        };
        subscription?: {
            fields: {
                plan: {
                    type: "string";
                    required: true;
                };
                referenceId: {
                    type: "string";
                    required: true;
                };
                stripeCustomerId: {
                    type: "string";
                    required: false;
                };
                stripeSubscriptionId: {
                    type: "string";
                    required: false;
                };
                status: {
                    type: "string";
                    defaultValue: string;
                };
                periodStart: {
                    type: "date";
                    required: false;
                };
                periodEnd: {
                    type: "date";
                    required: false;
                };
                cancelAtPeriodEnd: {
                    type: "boolean";
                    required: false;
                    defaultValue: false;
                };
                seats: {
                    type: "number";
                    required: false;
                };
            };
        } | undefined;
    };
};

export { stripe };
export type { StripePlan, Subscription };
