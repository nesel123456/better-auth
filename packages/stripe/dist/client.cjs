'use strict';

const stripeClient = (options) => {
  return {
    id: "stripe-client",
    $InferServerPlugin: {},
    pathMethods: {
      "/subscription/restore": "POST"
    }
  };
};

exports.stripeClient = stripeClient;
