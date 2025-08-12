const stripeClient = (options) => {
  return {
    id: "stripe-client",
    $InferServerPlugin: {},
    pathMethods: {
      "/subscription/restore": "POST"
    }
  };
};

export { stripeClient };
