const newResponse = new Response();
newResponse.headers.set("opc-next-page", "something");

const newResponseLastPage = new Response();
newResponseLastPage.headers.set("opc-next-page", "");

export const makeResponseWithData = <T extends any>(t: T) => ({
  response: newResponse,
  data: t,
});

export const makeResponseWithLastPageData = <T extends any>(t: T) => ({
  response: newResponseLastPage,
  data: t,
});

export const withDelay = <T extends any>(cb: (reject: (e: Error) => void) => T, baseDelay?: number) =>
  new Promise<T>((resolve, reject) => {
    setTimeout(() => resolve(cb(reject)), Math.random() * 1000 + (baseDelay || 500));
  });