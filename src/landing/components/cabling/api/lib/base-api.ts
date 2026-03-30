/**
 * API Client configuration options
 */
export interface BaseApiConfig {
  /**
   * Provide a hook for modifying requests before they are sent
   */
  requestInterceptors?: ((
    request: Request,
    operation?: string
  ) => PromiseLike<Request>)[]

  /**
   * Provide a hook for modifying responses and performing side effects like logging
   */
  responseInterceptors?: ((
    request: Request,
    response: Response,
    operation?: string
  ) => PromiseLike<Response>)[]

  /**
   * API error handler, called with either a JS error or an error Response
   */
  errorHandler?: (error: any) => void
}

/**
 * Export our own Fetch type since typescript 3.6+ has removed GlobalFetch.
 */
export type Fetch = (
  input: RequestInfo,
  init?: RequestInit
) => Promise<Response>

type FormBody = {
  type: "form"
  mediaType?: string
  params?: { [key: string]: string | File }
}

type ContentBody = {
  type: "content"
  contentType?: string
  content?: any
}

type Body = FormBody | ContentBody

type QueryParam = {
  collectionFormat?: string
  values: any | any[]
}

type RequestMetadata = {
  operationName: string
  path: string
  httpMethod: string
  headerParameters?: { [key: string]: any }
  queryParameters?: { [key: string]: QueryParam }
  body?: Body
  options: Partial<RequestInit>
  parseResponseBody?: boolean
}

export function entries(object: any): [string, any][] {
  return Object.keys(object).map((key) => [key, object[key]])
}

export function validateRequiredParameters(
  required: string[],
  operationName: string,
  params: { [key: string]: any }
): void {
  required.forEach((requiredParameter) => {
    if (params[requiredParameter] === null) {
      throw new Error(
        `Missing required parameter ${requiredParameter} when calling ${operationName}`
      )
    }
  })
}

export function buildEndpointFromTemplate(
  template: string,
  basePath: string,
  region: string,
  secondLevelDomain: string
): string {
  const base = template
    .replace("{region}", region)
    .replace("{secondLevelDomain}", secondLevelDomain)

  // remove any trailing slashes in the basePath or we'll end up
  // with two slashes in a row as paths begin with '/'
  const normalizedBasePath = (basePath || "").replace(/\/$/, "")

  return base + normalizedBasePath
}

type Resp<T> = T extends undefined
  ? Promise<Response>
  : Promise<{ response: Response; data: T }>

/**
 * API client, extended in swagger codegen template (../../templates/api.mustache)
 */
export class BaseAPI {
  /**
   * Allow developers to provide their own version of fetch. if
   * none is provided, global fetch will be used.
   */
  protected fetch: Fetch

  /**
   * API root url, including scheme and version path
   * for example: https://audit.r1.oracleiaas.com/20160918
   */
  protected basePath: string

  /**
   * API client configuration options
   */
  protected config: Required<BaseApiConfig>

  constructor(fetch: Fetch, basePath: string, config?: BaseApiConfig) {
    this.fetch = fetch || window.fetch
    this.basePath = basePath
    const userConfig = config || {}
    this.config = {
      requestInterceptors: userConfig.requestInterceptors || [],
      responseInterceptors: userConfig.responseInterceptors || [],
      errorHandler: userConfig.errorHandler || ((e) => console.error(e)),
    }
  }

  private invoke<T>(
    operationName: string,
    request: Request,
    parseResponseBody: boolean
  ): Resp<T> {
    let interceptedRequest = request
    return this.config.requestInterceptors
      .reduce((p, fn) => {
        return p.then((request) => fn(request, operationName))
      }, Promise.resolve(interceptedRequest))
      .then((req) => {
        interceptedRequest = req.clone()
        return this.fetch(req)
      })
      .then((response: Response) => {
        return this.config.responseInterceptors.reduce((p, fn) => {
          return p.then((response) =>
            fn(interceptedRequest, response, operationName)
          )
        }, Promise.resolve(response))
      })
      .then((response: Response) => {
        if (response.status >= 200 && response.status < 300) {
          if (parseResponseBody) {
            return response.json().then((data) => ({ response, data })) as any
          }
          return response
        } else {
          throw response
        }
      })
      .catch((e: any) => {
        this.config.errorHandler(e)
        throw e
      }) as Resp<T>
  }

  protected request<T = undefined>({
    operationName,
    path,
    httpMethod,
    headerParameters,
    queryParameters,
    body,
    options,
    parseResponseBody,
  }: RequestMetadata): Resp<T> {
    const url = new URL(path)

    // Query Parameters
    entries(queryParameters || {}).forEach(([paramKey, p]) => {
      const { collectionFormat = "csv", values } = p as QueryParam
      const valuesArray = (Array.isArray(values) ? values : [values])
        .filter((v) => v !== undefined)
        .map((v) => String(v))

      if (valuesArray.length > 0) {
        switch (collectionFormat) {
          case "multi":
            valuesArray.forEach((v) => url.searchParams.append(paramKey, v))
            break

          case "pipes":
            url.searchParams.append(paramKey, valuesArray.join("|"))
            break

          case "tsv":
            url.searchParams.append(paramKey, valuesArray.join("\t"))
            break

          case "ssv":
            url.searchParams.append(paramKey, valuesArray.join(" "))
            break

          case "csv":
          default:
            url.searchParams.append(paramKey, valuesArray.join(","))
        }
      }
    })

    const requestInit: RequestInit = Object.assign(
      { method: httpMethod },
      options
    )
    requestInit.headers = requestInit.headers || {}

    // Body
    if (body) {
      switch (body.type) {
        case "form":
          if (body.mediaType === "multipart/form-data") {
            const formData = new FormData()
            entries(body.params || {}).map(([param, value]) => {
              if (value) {
                formData.append(param, value)
              }
            })

            requestInit.body = formData
          } else {
            const encodedFormParams = entries(body.params || {}).map(
              ([param, value]) => {
                return `${encodeURIComponent(param)}=${encodeURIComponent(
                  value as string
                )}`
              }
            )

            ;(requestInit.headers as any)["Content-Type"] =
              "application/x-www-form-urlencoded"
            requestInit.body = encodedFormParams.join("&")
          }
          break

        case "content":
          const content = body.content || {}

          ;(requestInit.headers as any)["Content-Type"] =
            body.contentType || "application/json"
          requestInit.body =
            typeof content === "object" ? JSON.stringify(content) : content
          break
      }
    }

    // Header Parameters
    entries(headerParameters || {}).forEach(([param, value]) => {
      if (value) {
        ;(requestInit.headers as any)[param] = String(value)
      }
    })

    return this.invoke(
      operationName,
      new Request(url.href, requestInit),
      !!parseResponseBody
    )
  }
}
