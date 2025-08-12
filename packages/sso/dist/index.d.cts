import * as better_call from 'better-call';
import { User, OAuth2Tokens } from 'better-auth';
import * as z from 'zod/v4';

interface OIDCConfig {
    issuer: string;
    pkce: boolean;
    clientId: string;
    clientSecret: string;
    authorizationEndpoint?: string;
    discoveryEndpoint: string;
    userInfoEndpoint?: string;
    scopes?: string[];
    overrideUserInfo?: boolean;
    tokenEndpoint?: string;
    tokenEndpointAuthentication?: "client_secret_post" | "client_secret_basic";
    jwksEndpoint?: string;
    mapping?: {
        id?: string;
        email?: string;
        emailVerified?: string;
        name?: string;
        image?: string;
        extraFields?: Record<string, string>;
    };
}
interface SAMLConfig {
    issuer: string;
    entryPoint: string;
    signingKey: string;
    certificate: string;
    attributeConsumingServiceIndex: number;
    mapping?: {
        id?: string;
        email?: string;
        name?: string;
        firstName?: string;
        lastName?: string;
        extraFields?: Record<string, string>;
    };
}
interface SSOProvider {
    issuer: string;
    oidcConfig?: OIDCConfig;
    samlConfig?: SAMLConfig;
    userId: string;
    providerId: string;
    organizationId?: string;
}
interface SSOOptions {
    /**
     * custom function to provision a user when they sign in with an SSO provider.
     */
    provisionUser?: (data: {
        /**
         * The user object from the database
         */
        user: User & Record<string, any>;
        /**
         * The user info object from the provider
         */
        userInfo: Record<string, any>;
        /**
         * The OAuth2 tokens from the provider
         */
        token?: OAuth2Tokens;
        /**
         * The SSO provider
         */
        provider: SSOProvider;
    }) => Promise<void>;
    /**
     * Organization provisioning options
     */
    organizationProvisioning?: {
        disabled?: boolean;
        defaultRole?: "member" | "admin";
        getRole?: (data: {
            /**
             * The user object from the database
             */
            user: User & Record<string, any>;
            /**
             * The user info object from the provider
             */
            userInfo: Record<string, any>;
            /**
             * The OAuth2 tokens from the provider
             */
            token?: OAuth2Tokens;
            /**
             * The SSO provider
             */
            provider: SSOProvider;
        }) => Promise<"member" | "admin">;
    };
    /**
     * Override user info with the provider info.
     * @default false
     */
    defaultOverrideUserInfo?: boolean;
    /**
     * Disable implicit sign up for new users. When set to true for the provider,
     * sign-in need to be called with with requestSignUp as true to create new users.
     */
    disableImplicitSignUp?: boolean;
    /**
     * Configure the maximum number of SSO providers a user can register.
     * You can also pass a function that returns a number.
     * Set to 0 to disable SSO provider registration.
     *
     * @example
     * ```ts
     * providersLimit: async (user) => {
     *   const plan = await getUserPlan(user);
     *   return plan.name === "pro" ? 10 : 1;
     * }
     * ```
     * @default 10
     */
    providersLimit?: number | ((user: User) => Promise<number> | number);
    /**
     * Trust the email verified flag from the provider.
     * @default false
     */
    trustEmailVerified?: boolean;
}
declare const sso: (options?: SSOOptions) => {
    id: "sso";
    endpoints: {
        spMetadata: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body?: undefined;
            } & {
                method?: "GET" | undefined;
            } & {
                query: {
                    providerId: string;
                    format?: "xml" | "json" | undefined;
                };
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
                response: Response;
            } : Response>;
            options: {
                method: "GET";
                query: z.ZodObject<{
                    providerId: z.ZodString;
                    format: z.ZodDefault<z.ZodEnum<{
                        xml: "xml";
                        json: "json";
                    }>>;
                }, z.core.$strip>;
                metadata: {
                    openapi: {
                        summary: string;
                        description: string;
                        responses: {
                            "200": {
                                description: string;
                            };
                        };
                    };
                };
            } & {
                use: any[];
            };
            path: "/sso/saml2/sp/metadata";
        };
        registerSSOProvider: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body: {
                    providerId: string;
                    issuer: string;
                    domain: string;
                    oidcConfig?: {
                        clientId: string;
                        clientSecret: string;
                        authorizationEndpoint?: string | undefined;
                        tokenEndpoint?: string | undefined;
                        userInfoEndpoint?: string | undefined;
                        tokenEndpointAuthentication?: "client_secret_post" | "client_secret_basic" | undefined;
                        jwksEndpoint?: string | undefined;
                        discoveryEndpoint?: string | undefined;
                        scopes?: string[] | undefined;
                        pkce?: boolean | undefined;
                    } | undefined;
                    samlConfig?: {
                        entryPoint: string;
                        cert: string;
                        callbackUrl: string;
                        spMetadata: {
                            metadata: string;
                            binding?: string | undefined;
                            privateKey?: string | undefined;
                            privateKeyPass?: string | undefined;
                            isAssertionEncrypted?: boolean | undefined;
                            encPrivateKey?: string | undefined;
                            encPrivateKeyPass?: string | undefined;
                        };
                        audience?: string | undefined;
                        idpMetadata?: {
                            metadata: string;
                            privateKey?: string | undefined;
                            privateKeyPass?: string | undefined;
                            isAssertionEncrypted?: boolean | undefined;
                            encPrivateKey?: string | undefined;
                            encPrivateKeyPass?: string | undefined;
                        } | undefined;
                        wantAssertionsSigned?: boolean | undefined;
                        signatureAlgorithm?: string | undefined;
                        digestAlgorithm?: string | undefined;
                        identifierFormat?: string | undefined;
                        privateKey?: string | undefined;
                        decryptionPvk?: string | undefined;
                        additionalParams?: Record<string, any> | undefined;
                    } | undefined;
                    mapping?: {
                        id: string;
                        email: string;
                        name: string;
                        emailVerified?: string | undefined;
                        image?: string | undefined;
                        extraFields?: Record<string, any> | undefined;
                    } | undefined;
                    organizationId?: string | undefined;
                    overrideUserInfo?: boolean | undefined;
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
                    oidcConfig: OIDCConfig;
                    samlConfig: SAMLConfig;
                    redirectURI: string;
                    issuer: string;
                    userId: string;
                    providerId: string;
                    organizationId?: string;
                };
            } : {
                oidcConfig: OIDCConfig;
                samlConfig: SAMLConfig;
                redirectURI: string;
                issuer: string;
                userId: string;
                providerId: string;
                organizationId?: string;
            }>;
            options: {
                method: "POST";
                body: z.ZodObject<{
                    providerId: z.ZodString;
                    issuer: z.ZodString;
                    domain: z.ZodString;
                    oidcConfig: z.ZodOptional<z.ZodObject<{
                        clientId: z.ZodString;
                        clientSecret: z.ZodString;
                        authorizationEndpoint: z.ZodOptional<z.ZodString>;
                        tokenEndpoint: z.ZodOptional<z.ZodString>;
                        userInfoEndpoint: z.ZodOptional<z.ZodString>;
                        tokenEndpointAuthentication: z.ZodOptional<z.ZodEnum<{
                            client_secret_post: "client_secret_post";
                            client_secret_basic: "client_secret_basic";
                        }>>;
                        jwksEndpoint: z.ZodOptional<z.ZodString>;
                        discoveryEndpoint: z.ZodOptional<z.ZodString>;
                        scopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        pkce: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
                    }, z.core.$strip>>;
                    samlConfig: z.ZodOptional<z.ZodObject<{
                        entryPoint: z.ZodString;
                        cert: z.ZodString;
                        callbackUrl: z.ZodString;
                        audience: z.ZodOptional<z.ZodString>;
                        idpMetadata: z.ZodOptional<z.ZodObject<{
                            metadata: z.ZodString;
                            privateKey: z.ZodOptional<z.ZodString>;
                            privateKeyPass: z.ZodOptional<z.ZodString>;
                            isAssertionEncrypted: z.ZodOptional<z.ZodBoolean>;
                            encPrivateKey: z.ZodOptional<z.ZodString>;
                            encPrivateKeyPass: z.ZodOptional<z.ZodString>;
                        }, z.core.$strip>>;
                        spMetadata: z.ZodObject<{
                            metadata: z.ZodString;
                            binding: z.ZodOptional<z.ZodString>;
                            privateKey: z.ZodOptional<z.ZodString>;
                            privateKeyPass: z.ZodOptional<z.ZodString>;
                            isAssertionEncrypted: z.ZodOptional<z.ZodBoolean>;
                            encPrivateKey: z.ZodOptional<z.ZodString>;
                            encPrivateKeyPass: z.ZodOptional<z.ZodString>;
                        }, z.core.$strip>;
                        wantAssertionsSigned: z.ZodOptional<z.ZodBoolean>;
                        signatureAlgorithm: z.ZodOptional<z.ZodString>;
                        digestAlgorithm: z.ZodOptional<z.ZodString>;
                        identifierFormat: z.ZodOptional<z.ZodString>;
                        privateKey: z.ZodOptional<z.ZodString>;
                        decryptionPvk: z.ZodOptional<z.ZodString>;
                        additionalParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                    }, z.core.$strip>>;
                    mapping: z.ZodOptional<z.ZodObject<{
                        id: z.ZodString;
                        email: z.ZodString;
                        emailVerified: z.ZodOptional<z.ZodString>;
                        name: z.ZodString;
                        image: z.ZodOptional<z.ZodString>;
                        extraFields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                    }, z.core.$strip>>;
                    organizationId: z.ZodOptional<z.ZodString>;
                    overrideUserInfo: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
                }, z.core.$strip>;
                use: ((inputContext: better_call.MiddlewareInputContext<better_call.MiddlewareOptions>) => Promise<{
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
                }>)[];
                metadata: {
                    openapi: {
                        summary: string;
                        description: string;
                        responses: {
                            "200": {
                                description: string;
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object";
                                            properties: {
                                                issuer: {
                                                    type: string;
                                                    format: string;
                                                    description: string;
                                                };
                                                domain: {
                                                    type: string;
                                                    description: string;
                                                };
                                                oidcConfig: {
                                                    type: string;
                                                    properties: {
                                                        issuer: {
                                                            type: string;
                                                            format: string;
                                                            description: string;
                                                        };
                                                        pkce: {
                                                            type: string;
                                                            description: string;
                                                        };
                                                        clientId: {
                                                            type: string;
                                                            description: string;
                                                        };
                                                        clientSecret: {
                                                            type: string;
                                                            description: string;
                                                        };
                                                        authorizationEndpoint: {
                                                            type: string;
                                                            format: string;
                                                            nullable: boolean;
                                                            description: string;
                                                        };
                                                        discoveryEndpoint: {
                                                            type: string;
                                                            format: string;
                                                            description: string;
                                                        };
                                                        userInfoEndpoint: {
                                                            type: string;
                                                            format: string;
                                                            nullable: boolean;
                                                            description: string;
                                                        };
                                                        scopes: {
                                                            type: string;
                                                            items: {
                                                                type: string;
                                                            };
                                                            nullable: boolean;
                                                            description: string;
                                                        };
                                                        tokenEndpoint: {
                                                            type: string;
                                                            format: string;
                                                            nullable: boolean;
                                                            description: string;
                                                        };
                                                        tokenEndpointAuthentication: {
                                                            type: string;
                                                            enum: string[];
                                                            nullable: boolean;
                                                            description: string;
                                                        };
                                                        jwksEndpoint: {
                                                            type: string;
                                                            format: string;
                                                            nullable: boolean;
                                                            description: string;
                                                        };
                                                        mapping: {
                                                            type: string;
                                                            nullable: boolean;
                                                            properties: {
                                                                id: {
                                                                    type: string;
                                                                    description: string;
                                                                };
                                                                email: {
                                                                    type: string;
                                                                    description: string;
                                                                };
                                                                emailVerified: {
                                                                    type: string;
                                                                    nullable: boolean;
                                                                    description: string;
                                                                };
                                                                name: {
                                                                    type: string;
                                                                    description: string;
                                                                };
                                                                image: {
                                                                    type: string;
                                                                    nullable: boolean;
                                                                    description: string;
                                                                };
                                                                extraFields: {
                                                                    type: string;
                                                                    additionalProperties: {
                                                                        type: string;
                                                                    };
                                                                    nullable: boolean;
                                                                    description: string;
                                                                };
                                                            };
                                                            required: string[];
                                                        };
                                                    };
                                                    required: string[];
                                                    description: string;
                                                };
                                                organizationId: {
                                                    type: string;
                                                    nullable: boolean;
                                                    description: string;
                                                };
                                                userId: {
                                                    type: string;
                                                    description: string;
                                                };
                                                providerId: {
                                                    type: string;
                                                    description: string;
                                                };
                                                redirectURI: {
                                                    type: string;
                                                    format: string;
                                                    description: string;
                                                };
                                            };
                                            required: string[];
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            } & {
                use: any[];
            };
            path: "/sso/register";
        };
        signInSSO: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body: {
                    callbackURL: string;
                    email?: string | undefined;
                    organizationSlug?: string | undefined;
                    providerId?: string | undefined;
                    domain?: string | undefined;
                    errorCallbackURL?: string | undefined;
                    newUserCallbackURL?: string | undefined;
                    scopes?: string[] | undefined;
                    requestSignUp?: boolean | undefined;
                    providerType?: "oidc" | "saml" | undefined;
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
                    email: z.ZodOptional<z.ZodString>;
                    organizationSlug: z.ZodOptional<z.ZodString>;
                    providerId: z.ZodOptional<z.ZodString>;
                    domain: z.ZodOptional<z.ZodString>;
                    callbackURL: z.ZodString;
                    errorCallbackURL: z.ZodOptional<z.ZodString>;
                    newUserCallbackURL: z.ZodOptional<z.ZodString>;
                    scopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    requestSignUp: z.ZodOptional<z.ZodBoolean>;
                    providerType: z.ZodOptional<z.ZodEnum<{
                        oidc: "oidc";
                        saml: "saml";
                    }>>;
                }, z.core.$strip>;
                metadata: {
                    openapi: {
                        summary: string;
                        description: string;
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object";
                                        properties: {
                                            email: {
                                                type: string;
                                                description: string;
                                            };
                                            issuer: {
                                                type: string;
                                                description: string;
                                            };
                                            providerId: {
                                                type: string;
                                                description: string;
                                            };
                                            callbackURL: {
                                                type: string;
                                                description: string;
                                            };
                                            errorCallbackURL: {
                                                type: string;
                                                description: string;
                                            };
                                            newUserCallbackURL: {
                                                type: string;
                                                description: string;
                                            };
                                        };
                                        required: string[];
                                    };
                                };
                            };
                        };
                        responses: {
                            "200": {
                                description: string;
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object";
                                            properties: {
                                                url: {
                                                    type: string;
                                                    format: string;
                                                    description: string;
                                                };
                                                redirect: {
                                                    type: string;
                                                    description: string;
                                                    enum: boolean[];
                                                };
                                            };
                                            required: string[];
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            } & {
                use: any[];
            };
            path: "/sign-in/sso";
        };
        callbackSSO: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body?: undefined;
            } & {
                method?: "GET" | undefined;
            } & {
                query: {
                    state: string;
                    code?: string | undefined;
                    error?: string | undefined;
                    error_description?: string | undefined;
                };
            } & {
                params: {
                    providerId: string;
                };
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
                response: never;
            } : never>;
            options: {
                method: "GET";
                query: z.ZodObject<{
                    code: z.ZodOptional<z.ZodString>;
                    state: z.ZodString;
                    error: z.ZodOptional<z.ZodString>;
                    error_description: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
                metadata: {
                    isAction: boolean;
                    openapi: {
                        summary: string;
                        description: string;
                        responses: {
                            "302": {
                                description: string;
                            };
                        };
                    };
                };
            } & {
                use: any[];
            };
            path: "/sso/callback/:providerId";
        };
        callbackSSOSAML: {
            <AsResponse extends boolean = false, ReturnHeaders extends boolean = false>(inputCtx_0: {
                body: {
                    SAMLResponse: string;
                    RelayState?: string | undefined;
                };
            } & {
                method?: "POST" | undefined;
            } & {
                query?: Record<string, any> | undefined;
            } & {
                params: {
                    providerId: string;
                };
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
                response: never;
            } : never>;
            options: {
                method: "POST";
                body: z.ZodObject<{
                    SAMLResponse: z.ZodString;
                    RelayState: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
                metadata: {
                    isAction: boolean;
                    openapi: {
                        summary: string;
                        description: string;
                        responses: {
                            "302": {
                                description: string;
                            };
                            "400": {
                                description: string;
                            };
                            "401": {
                                description: string;
                            };
                        };
                    };
                };
            } & {
                use: any[];
            };
            path: "/sso/saml2/callback/:providerId";
        };
    };
    schema: {
        ssoProvider: {
            fields: {
                issuer: {
                    type: "string";
                    required: true;
                };
                oidcConfig: {
                    type: "string";
                    required: false;
                };
                samlConfig: {
                    type: "string";
                    required: false;
                };
                userId: {
                    type: "string";
                    references: {
                        model: string;
                        field: string;
                    };
                };
                providerId: {
                    type: "string";
                    required: true;
                    unique: true;
                };
                organizationId: {
                    type: "string";
                    required: false;
                };
                domain: {
                    type: "string";
                    required: true;
                };
            };
        };
    };
};

export { sso };
export type { OIDCConfig, SAMLConfig, SSOOptions, SSOProvider };
