export const AMP_INTERNAL_OVERRIDE_DEFINITIONS = [
  {
    key: "getUserInfo",
    label: "getUserInfo",
    httpMethod: "POST",
    path: "/",
    internalMethod: "getUserInfo",
    description: "Thông tin user trả về cho Amp CLI",
    defaultResponse: {
      ok: true,
      result: {
        id: "local-user",
        username: "local-user",
        githubLogin: null,
        slackUserID: null,
        email: "user@localhost",
        firstName: "Local",
        lastName: "User",
        emailVerified: true,
        profilePictureUrl: null,
        lastSignInAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        siteAdmin: false,
        features: [],
        mysteriousMessage: null,
        authenticated: true,
      },
    },
  },
  {
    key: "getUserFreeTierStatus",
    label: "getUserFreeTierStatus",
    httpMethod: "POST",
    path: "/",
    internalMethod: "getUserFreeTierStatus",
    description: "Trạng thái free tier của user",
    defaultResponse: {
      ok: true,
      result: {
        canUseAmpFree: false,
        isDailyGrantEnabled: false,
      },
    },
  },
  {
    key: "threadDisplayCostInfo",
    label: "threadDisplayCostInfo",
    httpMethod: "POST",
    path: "/",
    internalMethod: "threadDisplayCostInfo",
    description: "Thông tin cost display của thread",
    defaultResponse: {
      ok: true,
      result: {
        totalCostUSD: 0,
        totalCostDisplay: "$0.00",
      },
    },
  },
  {
    key: "uploadThread",
    label: "uploadThread",
    httpMethod: "POST",
    path: "/",
    internalMethod: "uploadThread",
    description: "Upload thread lên upstream",
    defaultResponse: {
      ok: true,
      result: {
        uploaded: false,
        skipped: true,
      },
    },
  },
  {
    key: "webSearch2",
    label: "webSearch2",
    httpMethod: "POST",
    path: "/",
    internalMethod: "webSearch2",
    description: "Kết quả web search nội bộ của Amp CLI",
    defaultResponse: {
      ok: true,
      result: {
        objective: "",
        searchQueries: [],
        maxResults: 0,
        provider: "override",
        results: [],
        totalResults: 0,
        fetchedAt: new Date().toISOString(),
      },
    },
  },
  {
    key: "extractWebPageContent",
    label: "extractWebPageContent",
    httpMethod: "POST",
    path: "/",
    internalMethod: "extractWebPageContent",
    description: "Trích xuất nội dung trang web nội bộ của Amp CLI",
    defaultResponse: {
      ok: true,
      result: {
        url: "",
        title: "",
        content: "",
        fetchedAt: new Date().toISOString(),
      },
    },
  },
  {
    key: "github-auth-status",
    label: "github-auth-status",
    httpMethod: "GET",
    path: "/github-auth-status",
    internalMethod: "github-auth-status",
    description: "Trạng thái kết nối GitHub code host",
    defaultResponse: {
      ok: true,
      result: {
        githubAuthStatus: "not_connected",
        githubLogin: null,
      },
    },
  },
];

export function buildDefaultAmpInternalOverrides() {
  return Object.fromEntries(
    AMP_INTERNAL_OVERRIDE_DEFINITIONS.map((item) => [
      item.key,
      {
        enabled: false,
        status: 200,
        body: JSON.stringify(item.defaultResponse, null, 2),
      },
    ])
  );
}

export function getAmpInternalOverrideDefinition(key) {
  return AMP_INTERNAL_OVERRIDE_DEFINITIONS.find((item) => item.key === key) || null;
}
