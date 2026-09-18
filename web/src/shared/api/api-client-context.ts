import { createContext } from "react";

import type { ApiClient } from "./api-client";

const ApiClientContext = createContext<ApiClient | null>(null);

export { ApiClientContext };
