declare namespace NodeJS {
  export interface ProcessEnv {
    POLIGON_API_URL?: string;
    CENTRAL_API_URL?: string;
    AI_DEVS_API_KEY?: string;
    OPENAI_API_KEY?: string;
    OPENAI_PROJECT_ID?: string;
    OPENAI_ORG_ID?: string;
    OLLAMA_API_URL?: string;
    QDRANT_API_KEY?: string;
    QDRANT_URL?: string;
    NEO4J_URL?: string;
    NEO4J_USERNAME?: string;
    NEO4J_PASSWORD?: string;
    SERVER_PORT?: string;
    SERVER_PUBLIC_URL: string;
  }
}
