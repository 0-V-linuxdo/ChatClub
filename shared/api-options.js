import {
  API_PROFILE_ENDPOINT_DEFAULT,
  API_PROFILE_MODEL_DEFAULT,
  DEFAULT_OPTIONS
} from "./constants.js";

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeProfile(value = {}, index = 0) {
  return {
    ...value,
    id: text(value.id, `api-profile-${index + 1}`),
    name: text(value.name, `API ${index + 1}`),
    endpoint: text(value.endpoint, API_PROFILE_ENDPOINT_DEFAULT),
    apiKey: String(value.apiKey || ""),
    model: text(value.model, API_PROFILE_MODEL_DEFAULT)
  };
}

function normalizeTemplate(value = {}, fallback = {}, index = 0) {
  return {
    ...fallback,
    ...value,
    id: text(value.id || fallback.id, `prompt-template-${index + 1}`),
    title: text(value.title || value.name || fallback.title, `Template ${index + 1}`),
    prompt: String(value.prompt ?? value.content ?? fallback.prompt ?? "")
  };
}

export function normalizeApiOptions(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const profiles = (Array.isArray(source.apiProfiles) && source.apiProfiles.length
    ? source.apiProfiles
    : DEFAULT_OPTIONS.apiProfiles).filter(Boolean).map(normalizeProfile);
  const optimizeTemplates = (Array.isArray(source.optimizePromptTemplates) && source.optimizePromptTemplates.length
    ? source.optimizePromptTemplates
    : DEFAULT_OPTIONS.optimizePromptTemplates).filter(Boolean).map((item, index) => normalizeTemplate(item, DEFAULT_OPTIONS.optimizePromptTemplates[0], index));
  const summaryTemplates = (Array.isArray(source.summaryPromptTemplates) && source.summaryPromptTemplates.length
    ? source.summaryPromptTemplates
    : DEFAULT_OPTIONS.summaryPromptTemplates).filter(Boolean).map((item, index) => normalizeTemplate(item, DEFAULT_OPTIONS.summaryPromptTemplates[0], index));
  const optimizeApiProfileId = profiles.some((item) => item.id === source.optimizeApiProfileId)
    ? source.optimizeApiProfileId : profiles[0]?.id || "";
  const summaryApiProfileId = profiles.some((item) => item.id === source.summaryApiProfileId)
    ? source.summaryApiProfileId : profiles[1]?.id || profiles[0]?.id || "";
  return {
    apiProfiles: profiles,
    optimizeApiProfileId,
    summaryApiProfileId,
    optimizePromptTemplates: optimizeTemplates,
    optimizePromptTemplateId: optimizeTemplates.some((item) => item.id === source.optimizePromptTemplateId)
      ? source.optimizePromptTemplateId : optimizeTemplates[0]?.id || "",
    summaryPromptTemplates: summaryTemplates,
    summaryPromptTemplateId: summaryTemplates.some((item) => item.id === source.summaryPromptTemplateId)
      ? source.summaryPromptTemplateId : summaryTemplates[0]?.id || ""
  };
}
