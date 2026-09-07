import {
  API_PROFILE_ENDPOINT_DEFAULT,
  API_PROFILE_MODEL_DEFAULT,
  DEFAULT_OPTIONS
} from "./constants.js";

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function apiProfileModel(profile) {
  return text(profile?.model, API_PROFILE_MODEL_DEFAULT) || API_PROFILE_MODEL_DEFAULT;
}

function normalizeApiProfileModels(profile = {}) {
  const listed = Array.isArray(profile?.models)
    ? profile.models.map((item) => text(item)).filter(Boolean)
    : [];
  const fallback = text(profile?.model) || listed[0] || API_PROFILE_MODEL_DEFAULT;
  const models = [];
  const seen = new Set();
  const push = (value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    models.push(value);
  };
  push(fallback);
  for (const value of listed) push(value);
  const catalog = models.length ? models : [API_PROFILE_MODEL_DEFAULT];
  const favoriteModels = [];
  const favoriteSeen = new Set();
  const listedFavorites = Array.isArray(profile?.favoriteModels) ? profile.favoriteModels : [];
  for (const item of listedFavorites) {
    const value = text(item);
    if (!value || !catalog.includes(value) || favoriteSeen.has(value)) continue;
    favoriteSeen.add(value);
    favoriteModels.push(value);
  }
  return {
    model: catalog[0] || API_PROFILE_MODEL_DEFAULT,
    models: catalog,
    favoriteModels
  };
}

export function apiProfileModels(profile) {
  return normalizeApiProfileModels(profile).models;
}

export function apiProfileFavoriteModels(profile) {
  return normalizeApiProfileModels(profile).favoriteModels;
}

export function apiProfileDropdownModels(profile) {
  const models = apiProfileModels(profile);
  const ordered = [];
  const seen = new Set();
  const push = (value) => {
    if (!value || seen.has(value) || !models.includes(value)) return;
    seen.add(value);
    ordered.push(value);
  };
  for (const value of apiProfileFavoriteModels(profile)) push(value);
  for (const value of models) push(value);
  return ordered;
}

export function resolveApiSlotModel(profile, requested) {
  const catalog = apiProfileModels(profile);
  const model = text(requested);
  return catalog.includes(model) ? model : "";
}

function normalizeProfile(value = {}, index = 0) {
  const modelsState = normalizeApiProfileModels(value);
  return {
    ...value,
    id: text(value.id, `api-profile-${index + 1}`),
    name: text(value.name, `API ${index + 1}`),
    endpoint: text(value.endpoint, API_PROFILE_ENDPOINT_DEFAULT),
    apiKey: String(value.apiKey || ""),
    model: modelsState.model,
    models: modelsState.models,
    ...(modelsState.favoriteModels.length ? { favoriteModels: modelsState.favoriteModels } : {})
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

function profileById(profiles, profileId) {
  return profiles.find((item) => item.id === profileId) || profiles[0] || null;
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
  const topicTitleApiProfileId = profiles.some((item) => item.id === source.topicTitleApiProfileId)
    ? source.topicTitleApiProfileId : profiles[0]?.id || "";
  return {
    apiProfiles: profiles,
    optimizeApiProfileId,
    summaryApiProfileId,
    topicTitleApiProfileId,
    optimizeApiModel: resolveApiSlotModel(profileById(profiles, optimizeApiProfileId), source.optimizeApiModel),
    summaryApiModel: resolveApiSlotModel(profileById(profiles, summaryApiProfileId), source.summaryApiModel),
    topicTitleApiModel: resolveApiSlotModel(profileById(profiles, topicTitleApiProfileId), source.topicTitleApiModel),
    optimizePromptTemplates: optimizeTemplates,
    optimizePromptTemplateId: optimizeTemplates.some((item) => item.id === source.optimizePromptTemplateId)
      ? source.optimizePromptTemplateId : optimizeTemplates[0]?.id || "",
    summaryPromptTemplates: summaryTemplates,
    summaryPromptTemplateId: summaryTemplates.some((item) => item.id === source.summaryPromptTemplateId)
      ? source.summaryPromptTemplateId : summaryTemplates[0]?.id || ""
  };
}
