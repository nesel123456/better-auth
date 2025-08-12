'use strict';

const ssoClient = () => {
  return {
    id: "sso-client",
    $InferServerPlugin: {}
  };
};

exports.ssoClient = ssoClient;
