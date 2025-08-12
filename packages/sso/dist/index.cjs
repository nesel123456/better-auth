'use strict';

const betterAuth = require('better-auth');
const api = require('better-auth/api');
const oauth2 = require('better-auth/oauth2');
const plugins = require('better-auth/plugins');
const z = require('zod/v4');
const saml = require('samlify');
const fetch = require('@better-fetch/fetch');
const jose = require('jose');
const cookies = require('better-auth/cookies');
const fastXmlParser = require('fast-xml-parser');

function _interopNamespaceCompat(e) {
	if (e && typeof e === 'object' && 'default' in e) return e;
	const n = Object.create(null);
	if (e) {
		for (const k in e) {
			n[k] = e[k];
		}
	}
	n.default = e;
	return n;
}

const z__namespace = /*#__PURE__*/_interopNamespaceCompat(z);
const saml__namespace = /*#__PURE__*/_interopNamespaceCompat(saml);

const fastValidator = {
  async validate(xml) {
    const isValid = fastXmlParser.XMLValidator.validate(xml, {
      allowBooleanAttributes: true
    });
    if (isValid === true) return "SUCCESS_VALIDATE_XML";
    throw "ERR_INVALID_XML";
  }
};
saml__namespace.setSchemaValidator(fastValidator);
const sso = (options) => {
  return {
    id: "sso",
    endpoints: {
      spMetadata: plugins.createAuthEndpoint(
        "/sso/saml2/sp/metadata",
        {
          method: "GET",
          query: z__namespace.object({
            providerId: z__namespace.string(),
            format: z__namespace.enum(["xml", "json"]).default("xml")
          }),
          metadata: {
            openapi: {
              summary: "Get Service Provider metadata",
              description: "Returns the SAML metadata for the Service Provider",
              responses: {
                "200": {
                  description: "SAML metadata in XML format"
                }
              }
            }
          }
        },
        async (ctx) => {
          const provider = await ctx.context.adapter.findOne({
            model: "ssoProvider",
            where: [
              {
                field: "providerId",
                value: ctx.query.providerId
              }
            ]
          });
          if (!provider) {
            throw new api.APIError("NOT_FOUND", {
              message: "No provider found for the given providerId"
            });
          }
          const parsedSamlConfig = JSON.parse(provider.samlConfig);
          const sp = saml__namespace.ServiceProvider({
            metadata: parsedSamlConfig.spMetadata.metadata
          });
          return new Response(sp.getMetadata(), {
            headers: {
              "Content-Type": "application/xml"
            }
          });
        }
      ),
      registerSSOProvider: plugins.createAuthEndpoint(
        "/sso/register",
        {
          method: "POST",
          body: z__namespace.object({
            providerId: z__namespace.string({}).meta({
              description: "The ID of the provider. This is used to identify the provider during login and callback"
            }),
            issuer: z__namespace.string({}).meta({
              description: "The issuer of the provider"
            }),
            domain: z__namespace.string({}).meta({
              description: "The domain of the provider. This is used for email matching"
            }),
            oidcConfig: z__namespace.object({
              clientId: z__namespace.string({}).meta({
                description: "The client ID"
              }),
              clientSecret: z__namespace.string({}).meta({
                description: "The client secret"
              }),
              authorizationEndpoint: z__namespace.string({}).meta({
                description: "The authorization endpoint"
              }).optional(),
              tokenEndpoint: z__namespace.string({}).meta({
                description: "The token endpoint"
              }).optional(),
              userInfoEndpoint: z__namespace.string({}).meta({
                description: "The user info endpoint"
              }).optional(),
              tokenEndpointAuthentication: z__namespace.enum(["client_secret_post", "client_secret_basic"]).optional(),
              jwksEndpoint: z__namespace.string({}).meta({
                description: "The JWKS endpoint"
              }).optional(),
              discoveryEndpoint: z__namespace.string().optional(),
              scopes: z__namespace.array(z__namespace.string(), {}).meta({
                description: "The scopes to request. Defaults to ['openid', 'email', 'profile', 'offline_access']"
              }).optional(),
              pkce: z__namespace.boolean({}).meta({
                description: "Whether to use PKCE for the authorization flow"
              }).default(true).optional()
            }).optional(),
            samlConfig: z__namespace.object({
              entryPoint: z__namespace.string({}).meta({
                description: "The entry point of the provider"
              }),
              cert: z__namespace.string({}).meta({
                description: "The certificate of the provider"
              }),
              callbackUrl: z__namespace.string({}).meta({
                description: "The callback URL of the provider"
              }),
              audience: z__namespace.string().optional(),
              idpMetadata: z__namespace.object({
                metadata: z__namespace.string(),
                privateKey: z__namespace.string().optional(),
                privateKeyPass: z__namespace.string().optional(),
                isAssertionEncrypted: z__namespace.boolean().optional(),
                encPrivateKey: z__namespace.string().optional(),
                encPrivateKeyPass: z__namespace.string().optional()
              }).optional(),
              spMetadata: z__namespace.object({
                metadata: z__namespace.string(),
                binding: z__namespace.string().optional(),
                privateKey: z__namespace.string().optional(),
                privateKeyPass: z__namespace.string().optional(),
                isAssertionEncrypted: z__namespace.boolean().optional(),
                encPrivateKey: z__namespace.string().optional(),
                encPrivateKeyPass: z__namespace.string().optional()
              }),
              wantAssertionsSigned: z__namespace.boolean().optional(),
              signatureAlgorithm: z__namespace.string().optional(),
              digestAlgorithm: z__namespace.string().optional(),
              identifierFormat: z__namespace.string().optional(),
              privateKey: z__namespace.string().optional(),
              decryptionPvk: z__namespace.string().optional(),
              additionalParams: z__namespace.record(z__namespace.string(), z__namespace.any()).optional()
            }).optional(),
            mapping: z__namespace.object({
              id: z__namespace.string({}).meta({
                description: "The field in the user info response that contains the id. Defaults to 'sub'"
              }),
              email: z__namespace.string({}).meta({
                description: "The field in the user info response that contains the email. Defaults to 'email'"
              }),
              emailVerified: z__namespace.string({}).meta({
                description: "The field in the user info response that contains whether the email is verified. defaults to 'email_verified'"
              }).optional(),
              name: z__namespace.string({}).meta({
                description: "The field in the user info response that contains the name. Defaults to 'name'"
              }),
              image: z__namespace.string({}).meta({
                description: "The field in the user info response that contains the image. Defaults to 'picture'"
              }).optional(),
              extraFields: z__namespace.record(z__namespace.string(), z__namespace.any()).optional()
            }).optional(),
            organizationId: z__namespace.string({}).meta({
              description: "If organization plugin is enabled, the organization id to link the provider to"
            }).optional(),
            overrideUserInfo: z__namespace.boolean({}).meta({
              description: "Override user info with the provider info. Defaults to false"
            }).default(false).optional()
          }),
          use: [api.sessionMiddleware],
          metadata: {
            openapi: {
              summary: "Register an OIDC provider",
              description: "This endpoint is used to register an OIDC provider. This is used to configure the provider and link it to an organization",
              responses: {
                "200": {
                  description: "OIDC provider created successfully",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          issuer: {
                            type: "string",
                            format: "uri",
                            description: "The issuer URL of the provider"
                          },
                          domain: {
                            type: "string",
                            description: "The domain of the provider, used for email matching"
                          },
                          oidcConfig: {
                            type: "object",
                            properties: {
                              issuer: {
                                type: "string",
                                format: "uri",
                                description: "The issuer URL of the provider"
                              },
                              pkce: {
                                type: "boolean",
                                description: "Whether PKCE is enabled for the authorization flow"
                              },
                              clientId: {
                                type: "string",
                                description: "The client ID for the provider"
                              },
                              clientSecret: {
                                type: "string",
                                description: "The client secret for the provider"
                              },
                              authorizationEndpoint: {
                                type: "string",
                                format: "uri",
                                nullable: true,
                                description: "The authorization endpoint URL"
                              },
                              discoveryEndpoint: {
                                type: "string",
                                format: "uri",
                                description: "The discovery endpoint URL"
                              },
                              userInfoEndpoint: {
                                type: "string",
                                format: "uri",
                                nullable: true,
                                description: "The user info endpoint URL"
                              },
                              scopes: {
                                type: "array",
                                items: { type: "string" },
                                nullable: true,
                                description: "The scopes requested from the provider"
                              },
                              tokenEndpoint: {
                                type: "string",
                                format: "uri",
                                nullable: true,
                                description: "The token endpoint URL"
                              },
                              tokenEndpointAuthentication: {
                                type: "string",
                                enum: [
                                  "client_secret_post",
                                  "client_secret_basic"
                                ],
                                nullable: true,
                                description: "Authentication method for the token endpoint"
                              },
                              jwksEndpoint: {
                                type: "string",
                                format: "uri",
                                nullable: true,
                                description: "The JWKS endpoint URL"
                              },
                              mapping: {
                                type: "object",
                                nullable: true,
                                properties: {
                                  id: {
                                    type: "string",
                                    description: "Field mapping for user ID (defaults to 'sub')"
                                  },
                                  email: {
                                    type: "string",
                                    description: "Field mapping for email (defaults to 'email')"
                                  },
                                  emailVerified: {
                                    type: "string",
                                    nullable: true,
                                    description: "Field mapping for email verification (defaults to 'email_verified')"
                                  },
                                  name: {
                                    type: "string",
                                    description: "Field mapping for name (defaults to 'name')"
                                  },
                                  image: {
                                    type: "string",
                                    nullable: true,
                                    description: "Field mapping for image (defaults to 'picture')"
                                  },
                                  extraFields: {
                                    type: "object",
                                    additionalProperties: { type: "string" },
                                    nullable: true,
                                    description: "Additional field mappings"
                                  }
                                },
                                required: ["id", "email", "name"]
                              }
                            },
                            required: [
                              "issuer",
                              "pkce",
                              "clientId",
                              "clientSecret",
                              "discoveryEndpoint"
                            ],
                            description: "OIDC configuration for the provider"
                          },
                          organizationId: {
                            type: "string",
                            nullable: true,
                            description: "ID of the linked organization, if any"
                          },
                          userId: {
                            type: "string",
                            description: "ID of the user who registered the provider"
                          },
                          providerId: {
                            type: "string",
                            description: "Unique identifier for the provider"
                          },
                          redirectURI: {
                            type: "string",
                            format: "uri",
                            description: "The redirect URI for the provider callback"
                          }
                        },
                        required: [
                          "issuer",
                          "domain",
                          "oidcConfig",
                          "userId",
                          "providerId",
                          "redirectURI"
                        ]
                      }
                    }
                  }
                }
              }
            }
          }
        },
        async (ctx) => {
          const user = ctx.context.session?.user;
          if (!user) {
            throw new api.APIError("UNAUTHORIZED");
          }
          const limit = typeof options?.providersLimit === "function" ? await options.providersLimit(user) : options?.providersLimit ?? 10;
          if (!limit) {
            throw new api.APIError("FORBIDDEN", {
              message: "SSO provider registration is disabled"
            });
          }
          const providers = await ctx.context.adapter.findMany({
            model: "ssoProvider",
            where: [{ field: "userId", value: user.id }]
          });
          if (providers.length >= limit) {
            throw new api.APIError("FORBIDDEN", {
              message: "You have reached the maximum number of SSO providers"
            });
          }
          const body = ctx.body;
          const issuerValidator = z__namespace.string().url();
          if (issuerValidator.safeParse(body.issuer).error) {
            throw new api.APIError("BAD_REQUEST", {
              message: "Invalid issuer. Must be a valid URL"
            });
          }
          const provider = await ctx.context.adapter.create({
            model: "ssoProvider",
            data: {
              issuer: body.issuer,
              domain: body.domain,
              oidcConfig: body.oidcConfig ? JSON.stringify({
                issuer: body.issuer,
                clientId: body.oidcConfig.clientId,
                clientSecret: body.oidcConfig.clientSecret,
                authorizationEndpoint: body.oidcConfig.authorizationEndpoint,
                tokenEndpoint: body.oidcConfig.tokenEndpoint,
                tokenEndpointAuthentication: body.oidcConfig.tokenEndpointAuthentication,
                jwksEndpoint: body.oidcConfig.jwksEndpoint,
                pkce: body.oidcConfig.pkce,
                discoveryEndpoint: body.oidcConfig.discoveryEndpoint || `${body.issuer}/.well-known/openid-configuration`,
                mapping: body.mapping,
                scopes: body.oidcConfig.scopes,
                userInfoEndpoint: body.oidcConfig.userInfoEndpoint,
                overrideUserInfo: ctx.body.overrideUserInfo || options?.defaultOverrideUserInfo || false
              }) : null,
              samlConfig: body.samlConfig ? JSON.stringify({
                issuer: body.issuer,
                entryPoint: body.samlConfig.entryPoint,
                cert: body.samlConfig.cert,
                callbackUrl: body.samlConfig.callbackUrl,
                audience: body.samlConfig.audience,
                idpMetadata: body.samlConfig.idpMetadata,
                spMetadata: body.samlConfig.spMetadata,
                wantAssertionsSigned: body.samlConfig.wantAssertionsSigned,
                signatureAlgorithm: body.samlConfig.signatureAlgorithm,
                digestAlgorithm: body.samlConfig.digestAlgorithm,
                identifierFormat: body.samlConfig.identifierFormat,
                privateKey: body.samlConfig.privateKey,
                decryptionPvk: body.samlConfig.decryptionPvk,
                additionalParams: body.samlConfig.additionalParams,
                mapping: body.mapping
              }) : null,
              organizationId: body.organizationId,
              userId: ctx.context.session.user.id,
              providerId: body.providerId
            }
          });
          return ctx.json({
            ...provider,
            oidcConfig: JSON.parse(
              provider.oidcConfig
            ),
            samlConfig: JSON.parse(
              provider.samlConfig
            ),
            redirectURI: `${ctx.context.baseURL}/sso/callback/${provider.providerId}`
          });
        }
      ),
      signInSSO: plugins.createAuthEndpoint(
        "/sign-in/sso",
        {
          method: "POST",
          body: z__namespace.object({
            email: z__namespace.string({}).meta({
              description: "The email address to sign in with. This is used to identify the issuer to sign in with. It's optional if the issuer is provided"
            }).optional(),
            organizationSlug: z__namespace.string({}).meta({
              description: "The slug of the organization to sign in with"
            }).optional(),
            providerId: z__namespace.string({}).meta({
              description: "The ID of the provider to sign in with. This can be provided instead of email or issuer"
            }).optional(),
            domain: z__namespace.string({}).meta({
              description: "The domain of the provider."
            }).optional(),
            callbackURL: z__namespace.string({}).meta({
              description: "The URL to redirect to after login"
            }),
            errorCallbackURL: z__namespace.string({}).meta({
              description: "The URL to redirect to after login"
            }).optional(),
            newUserCallbackURL: z__namespace.string({}).meta({
              description: "The URL to redirect to after login if the user is new"
            }).optional(),
            scopes: z__namespace.array(z__namespace.string(), {}).meta({
              description: "Scopes to request from the provider."
            }).optional(),
            requestSignUp: z__namespace.boolean({}).meta({
              description: "Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider"
            }).optional(),
            providerType: z__namespace.enum(["oidc", "saml"]).optional()
          }),
          metadata: {
            openapi: {
              summary: "Sign in with SSO provider",
              description: "This endpoint is used to sign in with an SSO provider. It redirects to the provider's authorization URL",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        email: {
                          type: "string",
                          description: "The email address to sign in with. This is used to identify the issuer to sign in with. It's optional if the issuer is provided"
                        },
                        issuer: {
                          type: "string",
                          description: "The issuer identifier, this is the URL of the provider and can be used to verify the provider and identify the provider during login. It's optional if the email is provided"
                        },
                        providerId: {
                          type: "string",
                          description: "The ID of the provider to sign in with. This can be provided instead of email or issuer"
                        },
                        callbackURL: {
                          type: "string",
                          description: "The URL to redirect to after login"
                        },
                        errorCallbackURL: {
                          type: "string",
                          description: "The URL to redirect to after login"
                        },
                        newUserCallbackURL: {
                          type: "string",
                          description: "The URL to redirect to after login if the user is new"
                        }
                      },
                      required: ["callbackURL"]
                    }
                  }
                }
              },
              responses: {
                "200": {
                  description: "Authorization URL generated successfully for SSO sign-in",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          url: {
                            type: "string",
                            format: "uri",
                            description: "The authorization URL to redirect the user to for SSO sign-in"
                          },
                          redirect: {
                            type: "boolean",
                            description: "Indicates that the client should redirect to the provided URL",
                            enum: [true]
                          }
                        },
                        required: ["url", "redirect"]
                      }
                    }
                  }
                }
              }
            }
          }
        },
        async (ctx) => {
          const body = ctx.body;
          let { email, organizationSlug, providerId, domain } = body;
          if (!email && !organizationSlug && !domain && !providerId) {
            throw new api.APIError("BAD_REQUEST", {
              message: "email, organizationSlug, domain or providerId is required"
            });
          }
          domain = body.domain || email?.split("@")[1];
          let orgId = "";
          if (organizationSlug) {
            orgId = await ctx.context.adapter.findOne({
              model: "organization",
              where: [
                {
                  field: "slug",
                  value: organizationSlug
                }
              ]
            }).then((res) => {
              if (!res) {
                return "";
              }
              return res.id;
            });
          }
          const provider = await ctx.context.adapter.findOne({
            model: "ssoProvider",
            where: [
              {
                field: providerId ? "providerId" : orgId ? "organizationId" : "domain",
                value: providerId || orgId || domain
              }
            ]
          }).then((res) => {
            if (!res) {
              return null;
            }
            return {
              ...res,
              oidcConfig: JSON.parse(res.oidcConfig)
            };
          });
          if (!provider) {
            throw new api.APIError("NOT_FOUND", {
              message: "No provider found for the issuer"
            });
          }
          if (body.providerType) {
            if (body.providerType === "oidc" && !provider.oidcConfig) {
              throw new api.APIError("BAD_REQUEST", {
                message: "OIDC provider is not configured"
              });
            }
            if (body.providerType === "saml" && !provider.samlConfig) {
              throw new api.APIError("BAD_REQUEST", {
                message: "SAML provider is not configured"
              });
            }
          }
          if (provider.oidcConfig && body.providerType !== "saml") {
            const state = await betterAuth.generateState(ctx);
            const redirectURI = `${ctx.context.baseURL}/sso/callback/${provider.providerId}`;
            const authorizationURL = await oauth2.createAuthorizationURL({
              id: provider.issuer,
              options: {
                clientId: provider.oidcConfig.clientId,
                clientSecret: provider.oidcConfig.clientSecret
              },
              redirectURI,
              state: state.state,
              codeVerifier: provider.oidcConfig.pkce ? state.codeVerifier : void 0,
              scopes: ctx.body.scopes || [
                "openid",
                "email",
                "profile",
                "offline_access"
              ],
              authorizationEndpoint: provider.oidcConfig.authorizationEndpoint
            });
            return ctx.json({
              url: authorizationURL.toString(),
              redirect: true
            });
          }
          if (provider.samlConfig) {
            const parsedSamlConfig = JSON.parse(
              provider.samlConfig
            );
            const sp = saml__namespace.ServiceProvider({
              metadata: parsedSamlConfig.spMetadata.metadata,
              allowCreate: true
            });
            const idp = saml__namespace.IdentityProvider({
              metadata: parsedSamlConfig.idpMetadata.metadata
            });
            const loginRequest = sp.createLoginRequest(
              idp,
              "redirect"
            );
            if (!loginRequest) {
              throw new api.APIError("BAD_REQUEST", {
                message: "Invalid SAML request"
              });
            }
            return ctx.json({
              url: `${loginRequest.context}&RelayState=${encodeURIComponent(
                body.callbackURL
              )}`,
              redirect: true
            });
          }
          throw new api.APIError("BAD_REQUEST", {
            message: "Invalid SSO provider"
          });
        }
      ),
      callbackSSO: plugins.createAuthEndpoint(
        "/sso/callback/:providerId",
        {
          method: "GET",
          query: z__namespace.object({
            code: z__namespace.string().optional(),
            state: z__namespace.string(),
            error: z__namespace.string().optional(),
            error_description: z__namespace.string().optional()
          }),
          metadata: {
            isAction: false,
            openapi: {
              summary: "Callback URL for SSO provider",
              description: "This endpoint is used as the callback URL for SSO providers. It handles the authorization code and exchanges it for an access token",
              responses: {
                "302": {
                  description: "Redirects to the callback URL"
                }
              }
            }
          }
        },
        async (ctx) => {
          const { code, state, error, error_description } = ctx.query;
          const stateData = await oauth2.parseState(ctx);
          if (!stateData) {
            const errorURL2 = ctx.context.options.onAPIError?.errorURL || `${ctx.context.baseURL}/error`;
            throw ctx.redirect(`${errorURL2}?error=invalid_state`);
          }
          const { callbackURL, errorURL, newUserURL, requestSignUp } = stateData;
          if (!code || error) {
            throw ctx.redirect(
              `${errorURL || callbackURL}?error=${error}&error_description=${error_description}`
            );
          }
          const provider = await ctx.context.adapter.findOne({
            model: "ssoProvider",
            where: [
              {
                field: "providerId",
                value: ctx.params.providerId
              }
            ]
          }).then((res) => {
            if (!res) {
              return null;
            }
            return {
              ...res,
              oidcConfig: JSON.parse(res.oidcConfig)
            };
          });
          if (!provider) {
            throw ctx.redirect(
              `${errorURL || callbackURL}/error?error=invalid_provider&error_description=provider not found`
            );
          }
          let config = provider.oidcConfig;
          if (!config) {
            throw ctx.redirect(
              `${errorURL || callbackURL}/error?error=invalid_provider&error_description=provider not found`
            );
          }
          const discovery = await fetch.betterFetch(config.discoveryEndpoint);
          if (discovery.data) {
            config = {
              tokenEndpoint: discovery.data.token_endpoint,
              tokenEndpointAuthentication: discovery.data.token_endpoint_auth_method,
              userInfoEndpoint: discovery.data.userinfo_endpoint,
              scopes: ["openid", "email", "profile", "offline_access"],
              ...config
            };
          }
          if (!config.tokenEndpoint) {
            throw ctx.redirect(
              `${errorURL || callbackURL}/error?error=invalid_provider&error_description=token_endpoint_not_found`
            );
          }
          const tokenResponse = await oauth2.validateAuthorizationCode({
            code,
            codeVerifier: config.pkce ? stateData.codeVerifier : void 0,
            redirectURI: `${ctx.context.baseURL}/sso/callback/${provider.providerId}`,
            options: {
              clientId: config.clientId,
              clientSecret: config.clientSecret
            },
            tokenEndpoint: config.tokenEndpoint,
            authentication: config.tokenEndpointAuthentication === "client_secret_post" ? "post" : "basic"
          }).catch((e) => {
            if (e instanceof fetch.BetterFetchError) {
              throw ctx.redirect(
                `${errorURL || callbackURL}?error=invalid_provider&error_description=${e.message}`
              );
            }
            return null;
          });
          if (!tokenResponse) {
            throw ctx.redirect(
              `${errorURL || callbackURL}/error?error=invalid_provider&error_description=token_response_not_found`
            );
          }
          let userInfo = null;
          if (tokenResponse.idToken) {
            const idToken = jose.decodeJwt(tokenResponse.idToken);
            if (!config.jwksEndpoint) {
              throw ctx.redirect(
                `${errorURL || callbackURL}/error?error=invalid_provider&error_description=jwks_endpoint_not_found`
              );
            }
            const verified = await oauth2.validateToken(
              tokenResponse.idToken,
              config.jwksEndpoint
            ).catch((e) => {
              ctx.context.logger.error(e);
              return null;
            });
            if (!verified) {
              throw ctx.redirect(
                `${errorURL || callbackURL}/error?error=invalid_provider&error_description=token_not_verified`
              );
            }
            if (verified.payload.iss !== provider.issuer) {
              throw ctx.redirect(
                `${errorURL || callbackURL}/error?error=invalid_provider&error_description=issuer_mismatch`
              );
            }
            const mapping = config.mapping || {};
            userInfo = {
              ...Object.fromEntries(
                Object.entries(mapping.extraFields || {}).map(
                  ([key, value]) => [key, verified.payload[value]]
                )
              ),
              id: idToken[mapping.id || "sub"],
              email: idToken[mapping.email || "email"],
              emailVerified: options?.trustEmailVerified ? idToken[mapping.emailVerified || "email_verified"] : false,
              name: idToken[mapping.name || "name"],
              image: idToken[mapping.image || "picture"]
            };
          }
          if (!userInfo) {
            if (!config.userInfoEndpoint) {
              throw ctx.redirect(
                `${errorURL || callbackURL}/error?error=invalid_provider&error_description=user_info_endpoint_not_found`
              );
            }
            const userInfoResponse = await fetch.betterFetch(config.userInfoEndpoint, {
              headers: {
                Authorization: `Bearer ${tokenResponse.accessToken}`
              }
            });
            if (userInfoResponse.error) {
              throw ctx.redirect(
                `${errorURL || callbackURL}/error?error=invalid_provider&error_description=${userInfoResponse.error.message}`
              );
            }
            userInfo = userInfoResponse.data;
          }
          if (!userInfo.email || !userInfo.id) {
            throw ctx.redirect(
              `${errorURL || callbackURL}/error?error=invalid_provider&error_description=missing_user_info`
            );
          }
          const linked = await oauth2.handleOAuthUserInfo(ctx, {
            userInfo: {
              email: userInfo.email,
              name: userInfo.name || userInfo.email,
              id: userInfo.id,
              image: userInfo.image,
              emailVerified: options?.trustEmailVerified ? userInfo.emailVerified || false : false
            },
            account: {
              idToken: tokenResponse.idToken,
              accessToken: tokenResponse.accessToken,
              refreshToken: tokenResponse.refreshToken,
              accountId: userInfo.id,
              providerId: provider.providerId,
              accessTokenExpiresAt: tokenResponse.accessTokenExpiresAt,
              refreshTokenExpiresAt: tokenResponse.refreshTokenExpiresAt,
              scope: tokenResponse.scopes?.join(",")
            },
            callbackURL,
            disableSignUp: options?.disableImplicitSignUp && !requestSignUp,
            overrideUserInfo: config.overrideUserInfo
          });
          if (linked.error) {
            throw ctx.redirect(
              `${errorURL || callbackURL}/error?error=${linked.error}`
            );
          }
          const { session, user } = linked.data;
          if (options?.provisionUser) {
            await options.provisionUser({
              user,
              userInfo,
              token: tokenResponse,
              provider
            });
          }
          if (provider.organizationId && !options?.organizationProvisioning?.disabled) {
            const isOrgPluginEnabled = ctx.context.options.plugins?.find(
              (plugin) => plugin.id === "organization"
            );
            if (isOrgPluginEnabled) {
              const isAlreadyMember = await ctx.context.adapter.findOne({
                model: "member",
                where: [
                  { field: "organizationId", value: provider.organizationId },
                  { field: "userId", value: user.id }
                ]
              });
              if (!isAlreadyMember) {
                const role = options?.organizationProvisioning?.getRole ? await options.organizationProvisioning.getRole({
                  user,
                  userInfo,
                  token: tokenResponse,
                  provider
                }) : options?.organizationProvisioning?.defaultRole || "member";
                await ctx.context.adapter.create({
                  model: "member",
                  data: {
                    organizationId: provider.organizationId,
                    userId: user.id,
                    role,
                    createdAt: /* @__PURE__ */ new Date(),
                    updatedAt: /* @__PURE__ */ new Date()
                  }
                });
              }
            }
          }
          await cookies.setSessionCookie(ctx, {
            session,
            user
          });
          let toRedirectTo;
          try {
            const url = linked.isRegister ? newUserURL || callbackURL : callbackURL;
            toRedirectTo = url.toString();
          } catch {
            toRedirectTo = linked.isRegister ? newUserURL || callbackURL : callbackURL;
          }
          throw ctx.redirect(toRedirectTo);
        }
      ),
      callbackSSOSAML: plugins.createAuthEndpoint(
        "/sso/saml2/callback/:providerId",
        {
          method: "POST",
          body: z__namespace.object({
            SAMLResponse: z__namespace.string(),
            RelayState: z__namespace.string().optional()
          }),
          metadata: {
            isAction: false,
            openapi: {
              summary: "Callback URL for SAML provider",
              description: "This endpoint is used as the callback URL for SAML providers.",
              responses: {
                "302": {
                  description: "Redirects to the callback URL"
                },
                "400": {
                  description: "Invalid SAML response"
                },
                "401": {
                  description: "Unauthorized - SAML authentication failed"
                }
              }
            }
          }
        },
        async (ctx) => {
          const { SAMLResponse, RelayState } = ctx.body;
          const { providerId } = ctx.params;
          const provider = await ctx.context.adapter.findOne({
            model: "ssoProvider",
            where: [{ field: "providerId", value: providerId }]
          });
          if (!provider) {
            throw new api.APIError("NOT_FOUND", {
              message: "No provider found for the given providerId"
            });
          }
          const parsedSamlConfig = JSON.parse(
            provider.samlConfig
          );
          const idp = saml__namespace.IdentityProvider({
            metadata: parsedSamlConfig.idpMetadata.metadata
          });
          const sp = saml__namespace.ServiceProvider({
            metadata: parsedSamlConfig.spMetadata.metadata
          });
          let parsedResponse;
          try {
            parsedResponse = await sp.parseLoginResponse(idp, "post", {
              body: { SAMLResponse, RelayState }
            });
            if (!parsedResponse) {
              throw new Error("Empty SAML response");
            }
          } catch (error) {
            ctx.context.logger.error("SAML response validation failed", error);
            throw new api.APIError("BAD_REQUEST", {
              message: "Invalid SAML response",
              details: error instanceof Error ? error.message : String(error)
            });
          }
          const { extract } = parsedResponse;
          const attributes = parsedResponse.extract.attributes;
          const mapping = parsedSamlConfig?.mapping ?? {};
          const userInfo = {
            ...Object.fromEntries(
              Object.entries(mapping.extraFields || {}).map(([key, value]) => [
                key,
                extract.attributes[value]
              ])
            ),
            id: attributes[mapping.id] || attributes["nameID"],
            email: attributes[mapping.email] || attributes["nameID"] || attributes["email"],
            name: [
              attributes[mapping.firstName] || attributes["givenName"],
              attributes[mapping.lastName] || attributes["surname"]
            ].filter(Boolean).join(" ") || parsedResponse.extract.attributes?.displayName,
            attributes: parsedResponse.extract.attributes,
            emailVerified: options?.trustEmailVerified ? attributes?.[mapping.emailVerified] || false : false
          };
          let user;
          const existingUser = await ctx.context.adapter.findOne({
            model: "user",
            where: [
              {
                field: "email",
                value: userInfo.email
              }
            ]
          });
          if (existingUser) {
            const accounts = await ctx.context.adapter.findOne({
              model: "account",
              where: [
                { field: "userId", value: existingUser.id },
                { field: "providerId", value: provider.providerId },
                { field: "accountId", value: userInfo.id }
              ]
            });
            if (!accounts) {
              const isTrustedProvider = ctx.context.options.account?.accountLinking?.trustedProviders?.includes(
                provider.providerId
              );
              if (!isTrustedProvider) {
                throw ctx.redirect(
                  `${parsedSamlConfig.callbackUrl}?error=account_not_found`
                );
              }
              await ctx.context.adapter.create({
                model: "account",
                data: {
                  userId: existingUser.id,
                  providerId: provider.providerId,
                  accountId: userInfo.id,
                  createdAt: /* @__PURE__ */ new Date(),
                  updatedAt: /* @__PURE__ */ new Date(),
                  accessToken: "",
                  refreshToken: ""
                }
              });
            }
            user = existingUser;
          } else {
            user = await ctx.context.adapter.create({
              model: "user",
              data: {
                email: userInfo.email,
                name: userInfo.name,
                emailVerified: options?.trustEmailVerified ? userInfo.emailVerified || false : false,
                createdAt: /* @__PURE__ */ new Date(),
                updatedAt: /* @__PURE__ */ new Date()
              }
            });
            await ctx.context.adapter.create({
              model: "account",
              data: {
                userId: user.id,
                providerId: provider.providerId,
                accountId: userInfo.id,
                accessToken: "",
                refreshToken: "",
                accessTokenExpiresAt: /* @__PURE__ */ new Date(),
                refreshTokenExpiresAt: /* @__PURE__ */ new Date(),
                scope: "",
                createdAt: /* @__PURE__ */ new Date(),
                updatedAt: /* @__PURE__ */ new Date()
              }
            });
          }
          if (options?.provisionUser) {
            await options.provisionUser({
              user,
              userInfo,
              provider
            });
          }
          if (provider.organizationId && !options?.organizationProvisioning?.disabled) {
            const isOrgPluginEnabled = ctx.context.options.plugins?.find(
              (plugin) => plugin.id === "organization"
            );
            if (isOrgPluginEnabled) {
              const isAlreadyMember = await ctx.context.adapter.findOne({
                model: "member",
                where: [
                  { field: "organizationId", value: provider.organizationId },
                  { field: "userId", value: user.id }
                ]
              });
              if (!isAlreadyMember) {
                const role = options?.organizationProvisioning?.getRole ? await options.organizationProvisioning.getRole({
                  user,
                  userInfo,
                  provider
                }) : options?.organizationProvisioning?.defaultRole || "member";
                await ctx.context.adapter.create({
                  model: "member",
                  data: {
                    organizationId: provider.organizationId,
                    userId: user.id,
                    role,
                    createdAt: /* @__PURE__ */ new Date(),
                    updatedAt: /* @__PURE__ */ new Date()
                  }
                });
              }
            }
          }
          let session = await ctx.context.internalAdapter.createSession(user.id, ctx);
          await cookies.setSessionCookie(ctx, { session, user });
          throw ctx.redirect(
            RelayState || `${parsedSamlConfig.callbackUrl}` || `${parsedSamlConfig.issuer}`
          );
        }
      )
    },
    schema: {
      ssoProvider: {
        fields: {
          issuer: {
            type: "string",
            required: true
          },
          oidcConfig: {
            type: "string",
            required: false
          },
          samlConfig: {
            type: "string",
            required: false
          },
          userId: {
            type: "string",
            references: {
              model: "user",
              field: "id"
            }
          },
          providerId: {
            type: "string",
            required: true,
            unique: true
          },
          organizationId: {
            type: "string",
            required: false
          },
          domain: {
            type: "string",
            required: true
          }
        }
      }
    }
  };
};

exports.sso = sso;
