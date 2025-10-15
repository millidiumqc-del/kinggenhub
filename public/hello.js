exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    body: "Hello from the test function! If you see this, Netlify Functions are working."
  };
};
