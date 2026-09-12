"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useDocumentTitle } from "@/features/shared/use-document-title";
import { MaterialIcon } from "@/features/shared/material-icon";

import {
  fetchPersonalContext,
  savePersonalContext,
  type PersonalChannel,
  type PersonalChannelInput,
  type PersonalCommuteInput,
  type PersonalContextResource,
  type PersonalContextRead,
  type PersonalLocationInput,
  type PersonalPreferenceInput,
} from "./personal-context";
import {
  I18nProvider,
  useI18n,
} from "./i18n";
import { useClientPreferences } from "./hooks/use-client-preferences";
import { CITY_COORDINATES, CITY_OPTIONS } from "./city-scope";
import styles from "./personal-settings.module.css";

type SetupSection = "location" | "preferences" | "commute" | "telegram";

const SECTIONS: Array<{
  key: SetupSection;
  icon: string;
  labelKey: string;
}> = [
  { key: "location", icon: "location_on", labelKey: "personalStepLocation" },
  { key: "preferences", icon: "tune", labelKey: "personalStepPreferences" },
  { key: "commute", icon: "route", labelKey: "personalStepCommute" },
  { key: "telegram", icon: "send", labelKey: "personalStepTelegram" },
];

const WEEKDAYS = [
  { value: 1, labelKey: "personalSettingsMon" },
  { value: 2, labelKey: "personalSettingsTue" },
  { value: 3, labelKey: "personalSettingsWed" },
  { value: 4, labelKey: "personalSettingsThu" },
  { value: 5, labelKey: "personalSettingsFri" },
  { value: 6, labelKey: "personalSettingsSat" },
  { value: 7, labelKey: "personalSettingsSun" },
] as const;

const DEFAULT_LOCATION: PersonalLocationInput = {
  label: "Home",
  country_code: "FI",
  city: "Helsinki",
  district: "",
  lat: 60.1699,
  lon: 24.9384,
  is_default: true,
};

const DEFAULT_PREFERENCES: PersonalPreferenceInput = {
  cares_energy: false,
  cares_air_quality: true,
  cares_weather: true,
  cares_commute: true,
  allergy_sensitive: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
  max_notifications_per_day: 6,
};

const DEFAULT_COMMUTE: PersonalCommuteInput = {
  name: "Weekday commute",
  origin_location_id: "",
  destination_location_id: "",
  preferred_mode: "TRANSIT",
  departure_time_local: "08:00",
  weekdays: [1, 2, 3, 4, 5],
  is_active: true,
};

type LocationForm = {
  id?: string;
  label: string;
  country_code: string;
  city: string;
  district: string;
  lat: string;
  lon: string;
  is_default: boolean;
};

type PersonalSaveRequest = {
  resource: PersonalContextResource;
  payload:
    | PersonalLocationInput
    | PersonalPreferenceInput
    | PersonalCommuteInput
    | PersonalChannelInput;
};

function locationFormFromDefault(): LocationForm {
  return {
    ...DEFAULT_LOCATION,
    id: undefined,
    district: "",
    lat: String(DEFAULT_LOCATION.lat),
    lon: String(DEFAULT_LOCATION.lon),
  };
}

function locationFormFromSaved(
  location: PersonalContextRead["locations"][number],
): LocationForm {
  return {
    id: location.id,
    label: location.label,
    country_code: location.country_code,
    city: location.city,
    district: location.district ?? "",
    lat: String(location.lat),
    lon: String(location.lon),
    is_default: location.is_default,
  };
}

function completionState(context: PersonalContextRead | null): Record<SetupSection, boolean> {
  return {
    location: Boolean(context?.locations.some((location) => location.is_default)),
    preferences: Boolean(context?.preferences),
    commute: Boolean(context?.commuteProfiles.some((profile) => profile.is_active)),
    telegram: Boolean(
      context?.channels.some(
        (channel) => channel.channel_type === "TELEGRAM" && channel.is_active && channel.is_verified,
      ),
    ),
  };
}

function channelForTelegram(channels: PersonalChannel[]): PersonalChannel | null {
  return channels.find((channel) => channel.channel_type === "TELEGRAM") ?? null;
}

export function PersonalSettingsPage() {
  const { languageMode, selectLanguageMode, themeMode, toggleThemeMode } = useClientPreferences();

  return (
    <I18nProvider language={languageMode}>
      <PersonalSettingsContent
        language={languageMode}
        onLanguageChange={selectLanguageMode}
        onThemeToggle={toggleThemeMode}
        themeMode={themeMode}
      />
    </I18nProvider>
  );
}

function PersonalSettingsContent({
  language,
  onLanguageChange,
  onThemeToggle,
  themeMode,
}: {
  language: "en" | "zh";
  onLanguageChange: (language: "en" | "zh") => void;
  onThemeToggle: () => void;
  themeMode: "light" | "dark";
}) {
  const { tKey } = useI18n();
  const [context, setContext] = useState<PersonalContextRead | null>(null);
  const [activeSection, setActiveSection] = useState<SetupSection>("location");
  const [locationForm, setLocationForm] = useState<LocationForm>(locationFormFromDefault);
  const [preferenceForm, setPreferenceForm] = useState<PersonalPreferenceInput>(DEFAULT_PREFERENCES);
  const [commuteForm, setCommuteForm] = useState<PersonalCommuteInput>(DEFAULT_COMMUTE);
  const [telegramId, setTelegramId] = useState("");
  const [telegramActive, setTelegramActive] = useState(false);
  const [outdoorLevel, setOutdoorLevel] = useState<"standard" | "sensitive">("standard");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const tKeyRef = useRef(tKey);
  tKeyRef.current = tKey;
  const isMountedRef = useRef(false);
  const contextRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const contextControllerRef = useRef<AbortController | null>(null);
  const saveControllerRef = useRef<AbortController | null>(null);

  useDocumentTitle(`${tKey("shell.personalSettingsTitle")} | ArkiWatch`);

  const completion = completionState(context);
  const completedCount = Object.values(completion).filter(Boolean).length;
  const completionPercent = Math.round((completedCount / SECTIONS.length) * 100);

  const refreshContext = useCallback(async () => {
    const requestId = ++contextRequestRef.current;
    contextControllerRef.current?.abort();
    const controller = new AbortController();
    contextControllerRef.current = controller;
    setIsLoading(true);
    const result = await fetchPersonalContext(controller.signal);
    if (contextControllerRef.current === controller) {
      contextControllerRef.current = null;
    }
    if (!isMountedRef.current || requestId !== contextRequestRef.current) {
      return false;
    }

    if (result.error || !result.data) {
      setNotice({ tone: "error", text: tKeyRef.current("shell.personalSettingsRequestFailed") });
      setIsLoading(false);
      return false;
    }

    const nextContext = result.data;
    setContext(nextContext);
    if (nextContext.locations.length > 0) {
      const defaultLocation =
        nextContext.locations.find((location) => location.is_default) ?? nextContext.locations[0];
      setLocationForm(locationFormFromSaved(defaultLocation));
    }
    if (nextContext.preferences) {
      setPreferenceForm({
        cares_energy: nextContext.preferences.cares_energy,
        cares_air_quality: nextContext.preferences.cares_air_quality,
        cares_weather: nextContext.preferences.cares_weather,
        cares_commute: nextContext.preferences.cares_commute,
        allergy_sensitive: nextContext.preferences.allergy_sensitive,
        quiet_hours_start: nextContext.preferences.quiet_hours_start,
        quiet_hours_end: nextContext.preferences.quiet_hours_end,
        max_notifications_per_day: nextContext.preferences.max_notifications_per_day,
      });
      setOutdoorLevel(nextContext.preferences.allergy_sensitive ? "sensitive" : "standard");
    }
    if (nextContext.locations.length >= 2) {
      const savedCommute =
        nextContext.commuteProfiles.find((profile) => profile.is_active) ??
        nextContext.commuteProfiles[0];
      if (savedCommute) {
        setCommuteForm({
          id: savedCommute.id,
          name: savedCommute.name,
          origin_location_id: savedCommute.origin_location_id,
          destination_location_id: savedCommute.destination_location_id,
          preferred_mode: savedCommute.preferred_mode,
          departure_time_local: savedCommute.departure_time_local,
          weekdays: savedCommute.weekdays,
          is_active: savedCommute.is_active,
        });
      } else {
        setCommuteForm((current) => ({
          ...current,
          origin_location_id:
            current.origin_location_id ||
            (nextContext.locations.find((location) => location.is_default) ?? nextContext.locations[0]).id,
          destination_location_id:
            current.destination_location_id ||
            (nextContext.locations.find((location) => !location.is_default) ?? nextContext.locations[1]).id,
        }));
      }
    }
    const telegram = channelForTelegram(nextContext.channels);
    setTelegramId(telegram?.external_id ?? "");
    setTelegramActive(telegram?.is_active ?? false);
    setIsLoading(false);
    return true;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refreshContext();
    return () => {
      isMountedRef.current = false;
      contextRequestRef.current += 1;
      saveRequestRef.current += 1;
      contextControllerRef.current?.abort();
      saveControllerRef.current?.abort();
      contextControllerRef.current = null;
      saveControllerRef.current = null;
    };
  }, [refreshContext]);

  const persist = async (requests: PersonalSaveRequest[], successText: string) => {
    const requestId = ++saveRequestRef.current;
    saveControllerRef.current?.abort();
    const controller = new AbortController();
    saveControllerRef.current = controller;
    setIsSaving(true);
    setNotice(null);

    for (const request of requests) {
      const result = await savePersonalContext(request.resource, request.payload, controller.signal);
      if (!isMountedRef.current || requestId !== saveRequestRef.current) {
        return false;
      }

      if (result.error) {
        if (saveControllerRef.current === controller) {
          saveControllerRef.current = null;
        }
        setNotice({ tone: "error", text: tKey("shell.personalSettingsRequestFailed") });
        setIsSaving(false);
        return false;
      }
    }

    const refreshed = await refreshContext();
    if (!isMountedRef.current || requestId !== saveRequestRef.current || !refreshed) {
      if (isMountedRef.current && requestId === saveRequestRef.current && !refreshed) {
        if (saveControllerRef.current === controller) {
          saveControllerRef.current = null;
        }
        setIsSaving(false);
      }
      return false;
    }

    if (saveControllerRef.current === controller) {
      saveControllerRef.current = null;
    }
    setNotice({ tone: "success", text: successText });
    setIsSaving(false);
    return true;
  };

  const save = async (
    resource: PersonalContextResource,
    payload: PersonalSaveRequest["payload"],
    successText: string,
  ) => persist([{ resource, payload }], successText);

  const locationPayload = (): PersonalLocationInput | null => {
    const label = locationForm.label.trim();
    const city = locationForm.city.trim();
    const countryCode = locationForm.country_code.trim().toUpperCase() || "FI";
    const latInput = locationForm.lat.trim();
    const lonInput = locationForm.lon.trim();
    const lat = Number(latInput);
    const lon = Number(lonInput);
    const hasValidCoordinates =
      latInput !== "" &&
      lonInput !== "" &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180;

    if (
      !label ||
      label.length > 40 ||
      !city ||
      city.length > 80 ||
      countryCode.length !== 2 ||
      !hasValidCoordinates
    ) {
      setNotice({ tone: "error", text: tKey("shell.personalSettingsLocationValidation") });
      return null;
    }

    return {
      ...locationForm,
      label,
      city,
      district: locationForm.district.trim() || null,
      country_code: countryCode,
      lat,
      lon,
    };
  };

  const preferencePayload = (): PersonalPreferenceInput | null => {
    const maxNotifications = Number(preferenceForm.max_notifications_per_day);
    if (!Number.isInteger(maxNotifications) || maxNotifications < 1 || maxNotifications > 20) {
      setNotice({ tone: "error", text: tKey("shell.personalSettingsPreferenceValidation") });
      return null;
    }

    return {
      ...preferenceForm,
      max_notifications_per_day: maxNotifications,
    };
  };

  const commutePayload = (): PersonalCommuteInput | null => {
    const name = commuteForm.name.trim();
    const departureTime = commuteForm.departure_time_local.trim();
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(departureTime);
    const hasValidDepartureTime = Boolean(
      timeMatch &&
        Number(timeMatch[1]) >= 0 &&
        Number(timeMatch[1]) <= 23 &&
        Number(timeMatch[2]) >= 0 &&
        Number(timeMatch[2]) <= 59,
    );
    const hasValidWeekdays =
      commuteForm.weekdays.length > 0 &&
      commuteForm.weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7);

    if (!name || name.length > 80 || !hasValidDepartureTime || !hasValidWeekdays) {
      setNotice({ tone: "error", text: tKey("shell.personalSettingsCommuteValidation") });
      return null;
    }

    return {
      ...commuteForm,
      name,
      departure_time_local: departureTime,
      weekdays: [...commuteForm.weekdays].sort((left, right) => left - right),
    };
  };

  const saveLocation = async () => {
    const payload = locationPayload();
    if (!payload) {
      return;
    }

    const didSave = await save(
      "locations",
      payload,
      tKey("shell.personalSettingsSaved"),
    );
    if (didSave) {
      setActiveSection("preferences");
    }
  };

  const savePreferences = async () => {
    const payload = preferencePayload();
    if (!payload) {
      return;
    }

    const didSave = await save("preferences", payload, tKey("shell.personalSettingsSaved"));
    if (didSave) {
      setActiveSection("commute");
    }
  };

  const saveCommute = async () => {
    if (!commuteForm.origin_location_id || !commuteForm.destination_location_id) {
      setNotice({ tone: "error", text: tKey("shell.personalSettingsSelectLocations") });
      return;
    }
    if (commuteForm.origin_location_id === commuteForm.destination_location_id) {
      setNotice({ tone: "error", text: tKey("shell.personalSettingsDifferentLocations") });
      return;
    }

    const payload = commutePayload();
    if (!payload) {
      return;
    }

    const didSave = await save("commuteProfiles", payload, tKey("shell.personalSettingsSaved"));
    if (didSave) {
      setActiveSection("telegram");
    }
  };

  const saveTelegram = async () => {
    const didSave = await save(
      "channels",
      {
        channel_type: "TELEGRAM",
        external_id: telegramId.trim() || null,
        is_active: telegramActive,
      },
      tKey("shell.personalSettingsSaved"),
    );
    if (didSave) {
      setActiveSection("location");
    }
  };

  const saveContext = async () => {
    const location = locationPayload();
    if (!location) {
      return;
    }
    const preferences = preferencePayload();
    if (!preferences) {
      return;
    }

    const hasOrigin = Boolean(commuteForm.origin_location_id);
    const hasDestination = Boolean(commuteForm.destination_location_id);
    if (hasOrigin !== hasDestination) {
      setNotice({ tone: "error", text: tKey("shell.personalSettingsSelectLocations") });
      return;
    }
    if (hasOrigin && commuteForm.origin_location_id === commuteForm.destination_location_id) {
      setNotice({ tone: "error", text: tKey("shell.personalSettingsDifferentLocations") });
      return;
    }

    const requests: PersonalSaveRequest[] = [
      { resource: "locations", payload: location },
      { resource: "preferences", payload: preferences },
    ];
    if (hasOrigin && hasDestination) {
      const commute = commutePayload();
      if (!commute) {
        return;
      }
      requests.push({ resource: "commuteProfiles", payload: commute });
    }

    await persist(requests, tKey("shell.personalSettingsSaved"));
  };

  const startNewLocation = () => {
    setLocationForm(locationFormFromDefault());
    setNotice(null);
    setActiveSection("location");
  };

  const editLocation = (location: PersonalContextRead["locations"][number]) => {
    setLocationForm(locationFormFromSaved(location));
    setNotice(null);
    setActiveSection("location");
  };

  const editCommute = (profile: PersonalContextRead["commuteProfiles"][number]) => {
    setCommuteForm({
      id: profile.id,
      name: profile.name,
      origin_location_id: profile.origin_location_id,
      destination_location_id: profile.destination_location_id,
      preferred_mode: profile.preferred_mode,
      departure_time_local: profile.departure_time_local,
      weekdays: profile.weekdays,
      is_active: profile.is_active,
    });
    setNotice(null);
    setActiveSection("commute");
  };

  const locationOptions = useMemo(() => context?.locations ?? [], [context]);
  const telegram = channelForTelegram(context?.channels ?? []);
  const currentSection = SECTIONS.find((section) => section.key === activeSection) ?? SECTIONS[0];

  const locationNameById = useMemo(
    () => new Map(locationOptions.map((location) => [location.id, `${location.label} · ${location.city}`])),
    [locationOptions],
  );

  if (isLoading && !context) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div aria-live="polite" className={styles.loading} role="status">
            {tKey("shell.personalSettingsLoading")}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <MaterialIcon name="sparkles" className={styles.brandMark} />
            <div>
              <span className={styles.eyebrow}>{tKey("shell.personalSettingsAccount")}</span>
              <h1 className={styles.title}>{tKey("shell.personalSettingsTitle")}</h1>
              <p className={styles.subtitle}>{tKey("shell.personalSettingsSubtitle")}</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.quietButton} onClick={onLanguageChange.bind(null, language === "en" ? "zh" : "en")} type="button">
              {tKey("shell.personalSettingsLanguage")}: {language === "en" ? "中文" : "EN"}
            </button>
            <Link className={styles.quietButton} href="/">
              {tKey("shell.personalSettingsBack")}
            </Link>
          </div>
        </header>

        <div className={styles.contextList}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="personal-home-city">
              {tKey("shell.personalSettingsHomeCity")}
            </label>
            <select
              id="personal-home-city"
              className={styles.select}
              onChange={(event) => {
                const option = CITY_OPTIONS.find((city) => city.value === event.target.value);
                if (!option) {
                  return;
                }
                const coordinates = CITY_COORDINATES[option.value];
                setLocationForm((current) => ({
                  ...current,
                  city: option.label,
                  lat: coordinates ? String(coordinates.latitude) : current.lat,
                  lon: coordinates ? String(coordinates.longitude) : current.lon,
                }));
              }}
              value={
                CITY_OPTIONS.find((city) => city.label === locationForm.city)?.value ??
                CITY_OPTIONS[0]?.value ??
                "helsinki"
              }
            >
              {CITY_OPTIONS.map((city) => (
                <option key={city.value} value={city.value}>
                  {city.label}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="personal-commute-departure">
              {tKey("shell.personalSettingsDeparture")}
            </label>
            <input
              id="personal-commute-departure"
              className={styles.timeInput}
              onChange={(event) => {
                setCommuteForm((current) => ({
                  ...current,
                  departure_time_local: event.target.value,
                }));
              }}
              type="time"
              value={commuteForm.departure_time_local}
            />
          </div>
          <div className={styles.field} role="group" aria-label={tKey("shell.personalSettingsOutdoorSensitivity")}>
            <span className={styles.label}>{tKey("shell.personalSettingsOutdoorSensitivity")}</span>
            <div className={styles.segmented}>
              {(["standard", "sensitive"] as const).map((level) => (
                <button
                  aria-pressed={outdoorLevel === level}
                  className={outdoorLevel === level ? styles.segmentedActive : undefined}
                  key={level}
                  onClick={() => {
                    setOutdoorLevel(level);
                    setPreferenceForm((current) => ({
                      ...current,
                      allergy_sensitive: level === "sensitive",
                    }));
                  }}
                  type="button"
                >
                  {tKey(
                    level === "standard"
                      ? "shell.personalSettingsSensitivityStandard"
                      : "shell.personalSettingsSensitivitySensitive",
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field} role="group" aria-label={tKey("shell.personalSettingsTheme")}>
            <span className={styles.label}>{tKey("shell.personalSettingsTheme")}</span>
            <div className={styles.segmented}>
              <button
                aria-pressed={themeMode === "light"}
                className={themeMode === "light" ? styles.segmentedActive : undefined}
                onClick={() => {
                  if (themeMode !== "light") {
                    onThemeToggle();
                  }
                }}
                type="button"
              >
                {tKey("shell.personalSettingsThemeLight")}
              </button>
              <button
                aria-pressed={themeMode === "dark"}
                className={themeMode === "dark" ? styles.segmentedActive : undefined}
                onClick={() => {
                  if (themeMode !== "dark") {
                    onThemeToggle();
                  }
                }}
                type="button"
              >
                {tKey("shell.personalSettingsThemeDark")}
              </button>
            </div>
          </div>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.label}>{tKey("shell.personalSettingsDataBoundary")}</span>
            <p className={styles.hint}>{tKey("shell.personalSettingsDataBoundaryCopy")}</p>
          </div>
        </div>
        <div className={styles.contextActions}>
          <button
            className={styles.primaryButton}
            disabled={isSaving}
            onClick={() => void saveContext()}
            type="button"
          >
            {tKey("shell.personalSettingsSaveContext")}
          </button>
          <button
            className={styles.quietButton}
            onClick={() => {
              void refreshContext();
            }}
            type="button"
          >
            {tKey("shell.personalSettingsReset")}
          </button>
        </div>

        <div className={styles.layout}>
          <nav className={styles.nav} aria-label={tKey("shell.personalSettingsTitle")}>
            {SECTIONS.map((section) => (
              <button
                className={`${styles.navItem}${activeSection === section.key ? ` ${styles.navItemActive}` : ""}${completion[section.key] ? ` ${styles.navItemComplete}` : ""}`}
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                aria-current={activeSection === section.key ? "step" : undefined}
                type="button"
              >
                <MaterialIcon name={section.icon} className={styles.navIcon} />
                <span className={styles.navCopy}>
                  <span className={styles.navTitle}>{tKey(`shell.${section.labelKey}`)}</span>
                  <span className={styles.navStatus}>
                    {completion[section.key]
                      ? tKey("shell.personalSettingsComplete")
                      : tKey("shell.personalSettingsIncomplete")}
                  </span>
                </span>
              </button>
            ))}
          </nav>

          <section className={styles.content}>
            <div className={styles.hero}>
              <div>
                <span className={styles.sectionKicker}>{tKey("shell.personalAssistantContext")}</span>
                <h2>{tKey(`shell.${currentSection.labelKey}`)}</h2>
                <p>{tKey("shell.personalSettingsSubtitle")}</p>
              </div>
              <div className={styles.progress}>
                <span
                  className={styles.progressRing}
                  data-value={completionPercent}
                  style={{ "--progress": `${completionPercent * 3.6}deg` } as CSSProperties}
                />
                <span className={styles.progressLabel}>
                  {tKey("shell.personalSettingsProgress").replace("{percent}", String(completionPercent))}
                </span>
              </div>
            </div>

            {notice ? (
              <div
                className={`${styles.notice}${notice.tone === "error" ? ` ${styles.noticeError}` : ""}`}
                role={notice.tone === "error" ? "alert" : "status"}
              >
                <MaterialIcon name={notice.tone === "error" ? "error" : "check_circle"} />
                {notice.text}
              </div>
            ) : null}

            {activeSection === "location" ? (
              <LocationSection
                context={context}
                form={locationForm}
                isSaving={isSaving}
                onChange={setLocationForm}
                onEdit={editLocation}
                onNew={startNewLocation}
                onSave={saveLocation}
                tKey={tKey}
              />
            ) : null}
            {activeSection === "preferences" ? (
              <PreferencesSection
                form={preferenceForm}
                isSaving={isSaving}
                onChange={setPreferenceForm}
                onSave={savePreferences}
                tKey={tKey}
              />
            ) : null}
            {activeSection === "commute" ? (
              <CommuteSection
                context={context}
                form={commuteForm}
                isSaving={isSaving}
                locationNameById={locationNameById}
                onChange={setCommuteForm}
                onEdit={editCommute}
                onSave={saveCommute}
                tKey={tKey}
              />
            ) : null}
            {activeSection === "telegram" ? (
              <TelegramSection
                channel={telegram}
                isSaving={isSaving}
                onChange={setTelegramId}
                active={telegramActive}
                onActiveChange={setTelegramActive}
                onSave={saveTelegram}
                tKey={tKey}
                value={telegramId}
              />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

type SettingsCopy = (key: string) => string;

function LocationSection({
  context,
  form,
  isSaving,
  onChange,
  onEdit,
  onNew,
  onSave,
  tKey,
}: {
  context: PersonalContextRead | null;
  form: LocationForm;
  isSaving: boolean;
  onChange: (form: LocationForm) => void;
  onEdit: (location: PersonalContextRead["locations"][number]) => void;
  onNew: () => void;
  onSave: () => void;
  tKey: SettingsCopy;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionKicker}>{tKey("shell.personalStepLocation")}</span>
          <h3>{tKey(form.id ? "shell.personalSettingsEditLocation" : "shell.personalSettingsAddLocation")}</h3>
          <p className={styles.hint}>{tKey("shell.personalSettingsLocationHint")}</p>
        </div>
        {context?.locations.length ? (
          <button className={styles.textButton} onClick={onNew} type="button">
            {tKey("shell.personalSettingsAddAnotherLocation")}
          </button>
        ) : null}
      </div>
      <div className={styles.formGrid}>
        <Field label={tKey("shell.personalSettingsLabel")}>
          <input className={styles.input} maxLength={40} value={form.label} onChange={(event) => onChange({ ...form, label: event.target.value })} />
        </Field>
        <Field label={tKey("shell.personalSettingsCity")}>
          <input className={styles.input} maxLength={80} value={form.city} onChange={(event) => onChange({ ...form, city: event.target.value })} />
        </Field>
        <Field label={tKey("shell.personalSettingsDistrict")}>
          <input className={styles.input} maxLength={80} value={form.district} onChange={(event) => onChange({ ...form, district: event.target.value })} />
        </Field>
        <Field label={tKey("shell.personalSettingsCountryCode")}>
          <input className={styles.input} maxLength={2} value={form.country_code} onChange={(event) => onChange({ ...form, country_code: event.target.value })} />
        </Field>
        <Field label={tKey("shell.personalSettingsLatitude")}>
          <input className={styles.input} inputMode="decimal" type="number" step="any" value={form.lat} onChange={(event) => onChange({ ...form, lat: event.target.value })} />
        </Field>
        <Field label={tKey("shell.personalSettingsLongitude")}>
          <input className={styles.input} inputMode="decimal" type="number" step="any" value={form.lon} onChange={(event) => onChange({ ...form, lon: event.target.value })} />
        </Field>
        <label className={`${styles.toggleRow} ${styles.fieldWide}`}>
          <input checked={form.is_default} type="checkbox" onChange={(event) => onChange({ ...form, is_default: event.target.checked })} />
          <span>{tKey("shell.personalSettingsDefault")}</span>
        </label>
      </div>
      <div className={styles.buttonRow}>
        <button className={styles.primaryButton} disabled={isSaving} onClick={onSave} type="button">
          {isSaving ? tKey("shell.personalSettingsSaving") : tKey("shell.personalSettingsSave")}
        </button>
      </div>
      <div className={styles.savedList}>
        <span className={styles.sectionKicker}>{tKey("shell.personalSettingsSavedLocations")}</span>
        {context?.locations.length ? context.locations.map((location) => (
          <div className={styles.savedRow} key={location.id}>
            <span>
              <strong>{location.label}{location.is_default ? ` · ${tKey("shell.personalSettingsDefaultMarker")}` : ""}</strong>
              <span>{location.city}{location.district ? ` · ${location.district}` : ""}</span>
            </span>
            <span className={styles.savedActions}>
              <span className={styles.savedMeta}>{location.lat.toFixed(4)}, {location.lon.toFixed(4)}</span>
              <button className={styles.textButton} onClick={() => onEdit(location)} type="button">
                {tKey("shell.personalSettingsEdit")}
              </button>
            </span>
          </div>
        )) : <div className={styles.empty}>{tKey("shell.personalSettingsNoLocations")}</div>}
      </div>
    </section>
  );
}

function PreferencesSection({
  form,
  isSaving,
  onChange,
  onSave,
  tKey,
}: {
  form: PersonalPreferenceInput;
  isSaving: boolean;
  onChange: (form: PersonalPreferenceInput) => void;
  onSave: () => void;
  tKey: SettingsCopy;
}) {
  const toggles: Array<[keyof PersonalPreferenceInput, string]> = [
    ["cares_weather", tKey("shell.personalSettingsWeather")],
    ["cares_air_quality", tKey("shell.personalSettingsAirQuality")],
    ["cares_commute", tKey("shell.personalSettingsCommute")],
    ["cares_energy", tKey("shell.personalSettingsEnergy")],
    ["allergy_sensitive", tKey("shell.personalSettingsAllergy")],
  ];

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionKicker}>{tKey("shell.personalStepPreferences")}</span>
          <h3>{tKey("shell.personalStepPreferences")}</h3>
          <p className={styles.hint}>{tKey("shell.personalSettingsPreferencesHint")}</p>
        </div>
      </div>
      <div className={styles.toggleGrid}>
        {toggles.map(([key, label]) => (
          <label className={styles.toggleRow} key={key}>
            <input
              checked={Boolean(form[key])}
              type="checkbox"
              onChange={(event) => onChange({ ...form, [key]: event.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className={styles.fieldRow}>
        <Field label={tKey("shell.personalSettingsQuietHours")}>
          <div className={styles.fieldRow}>
            <input className={styles.input} aria-label={tKey("shell.personalSettingsFrom")} type="time" value={form.quiet_hours_start ?? ""} onChange={(event) => onChange({ ...form, quiet_hours_start: event.target.value || null })} />
            <input className={styles.input} aria-label={tKey("shell.personalSettingsTo")} type="time" value={form.quiet_hours_end ?? ""} onChange={(event) => onChange({ ...form, quiet_hours_end: event.target.value || null })} />
          </div>
        </Field>
        <Field label={tKey("shell.personalSettingsNotifications")}>
          <input className={styles.input} min={1} max={20} type="number" value={form.max_notifications_per_day} onChange={(event) => onChange({ ...form, max_notifications_per_day: Number(event.target.value) })} />
        </Field>
      </div>
      <div className={styles.buttonRow}>
        <button className={styles.primaryButton} disabled={isSaving} onClick={onSave} type="button">
          {isSaving ? tKey("shell.personalSettingsSaving") : tKey("shell.personalSettingsSave")}
        </button>
      </div>
    </section>
  );
}

function CommuteSection({
  context,
  form,
  isSaving,
  locationNameById,
  onChange,
  onEdit,
  onSave,
  tKey,
}: {
  context: PersonalContextRead | null;
  form: PersonalCommuteInput;
  isSaving: boolean;
  locationNameById: Map<string, string>;
  onChange: (form: PersonalCommuteInput) => void;
  onEdit: (profile: PersonalContextRead["commuteProfiles"][number]) => void;
  onSave: () => void;
  tKey: SettingsCopy;
}) {
  const locations = context?.locations ?? [];
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionKicker}>{tKey("shell.personalStepCommute")}</span>
          <h3>{tKey("shell.personalSettingsAddCommute")}</h3>
          <p className={styles.hint}>{tKey("shell.personalSettingsCommuteHint")}</p>
        </div>
      </div>
      {locations.length < 2 ? (
        <div className={styles.empty}>{tKey("shell.personalSettingsSelectLocations")}</div>
      ) : (
        <>
          <div className={styles.formGrid}>
            <Field label={tKey("shell.personalSettingsProfileName")}>
              <input className={styles.input} maxLength={80} value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
            </Field>
            <Field label={tKey("shell.personalSettingsMode")}>
              <select className={styles.select} value={form.preferred_mode} onChange={(event) => onChange({ ...form, preferred_mode: event.target.value as PersonalCommuteInput["preferred_mode"] })}>
                <option value="TRANSIT">{tKey("shell.personalSettingsTransit")}</option>
                <option value="WALK">{tKey("shell.personalSettingsWalk")}</option>
                <option value="BIKE">{tKey("shell.personalSettingsBike")}</option>
                <option value="DRIVE">{tKey("shell.personalSettingsDrive")}</option>
              </select>
            </Field>
            <Field label={tKey("shell.personalSettingsOrigin")}>
              <select className={styles.select} value={form.origin_location_id} onChange={(event) => onChange({ ...form, origin_location_id: event.target.value })}>
                {locations.map((location) => <option key={location.id} value={location.id}>{locationNameById.get(location.id)}</option>)}
              </select>
            </Field>
            <Field label={tKey("shell.personalSettingsDestination")}>
              <select className={styles.select} value={form.destination_location_id} onChange={(event) => onChange({ ...form, destination_location_id: event.target.value })}>
                {locations.map((location) => <option key={location.id} value={location.id}>{locationNameById.get(location.id)}</option>)}
              </select>
            </Field>
            <Field label={tKey("shell.personalSettingsDeparture")}>
              <input className={styles.input} type="time" value={form.departure_time_local} onChange={(event) => onChange({ ...form, departure_time_local: event.target.value })} />
            </Field>
            <Field label={tKey("shell.personalSettingsWeekdays")}>
              <div className={styles.days}>
                {WEEKDAYS.map((day) => {
                  const active = form.weekdays.includes(day.value);
                  return <button aria-pressed={active} className={`${styles.dayButton}${active ? ` ${styles.dayButtonActive}` : ""}`} key={day.value} onClick={() => onChange({ ...form, weekdays: active ? form.weekdays.filter((value) => value !== day.value) : [...form.weekdays, day.value].sort() })} type="button">{tKey(`shell.${day.labelKey}`)}</button>;
                })}
              </div>
            </Field>
            <label className={`${styles.toggleRow} ${styles.fieldWide}`}>
              <input
                checked={Boolean(form.is_active)}
                type="checkbox"
                onChange={(event) => onChange({ ...form, is_active: event.target.checked })}
              />
              <span>{tKey("shell.personalSettingsCommuteActive")}</span>
            </label>
          </div>
          <div className={styles.buttonRow}>
            <button className={styles.primaryButton} disabled={isSaving} onClick={onSave} type="button">
              {isSaving ? tKey("shell.personalSettingsSaving") : tKey("shell.personalSettingsSave")}
            </button>
          </div>
        </>
      )}
      <div className={styles.savedList}>
        <span className={styles.sectionKicker}>{tKey("shell.personalStepCommute")}</span>
        {context?.commuteProfiles.length ? context.commuteProfiles.map((profile) => (
          <div className={styles.savedRow} key={profile.id}>
            <span>
              <strong>{profile.name}</strong>
              <span>{locationNameById.get(profile.origin_location_id) ?? "?"} → {locationNameById.get(profile.destination_location_id) ?? "?"} · {profile.departure_time_local}</span>
            </span>
            <span className={styles.savedActions}>
              <span className={styles.savedMeta}>
                {profile.preferred_mode} · {profile.is_active
                  ? tKey("shell.personalSettingsActive")
                  : tKey("shell.personalSettingsPaused")}
              </span>
              <button className={styles.textButton} onClick={() => onEdit(profile)} type="button">
                {tKey("shell.personalSettingsEdit")}
              </button>
            </span>
          </div>
        )) : <div className={styles.empty}>{tKey("shell.personalSettingsNoCommutes")}</div>}
      </div>
    </section>
  );
}

function TelegramSection({
  active,
  channel,
  isSaving,
  onChange,
  onActiveChange,
  onSave,
  tKey,
  value,
}: {
  active: boolean;
  channel: PersonalChannel | null;
  isSaving: boolean;
  onChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onSave: () => void;
  tKey: SettingsCopy;
  value: string;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionKicker}>{tKey("shell.personalStepTelegram")}</span>
          <h3>{tKey("shell.personalStepTelegram")}</h3>
          <p className={styles.hint}>{tKey("shell.personalSettingsTelegramHint")}</p>
        </div>
      </div>
      <div className={styles.statusRow}>
        <span className={styles.statusText}>{tKey("shell.personalSettingsTelegramStatus")}</span>
        <strong>
          {!channel
            ? tKey("shell.personalSettingsNotConfigured")
            : !channel.is_active
              ? tKey("shell.personalSettingsDisabled")
              : channel.is_verified
                ? tKey("shell.personalSettingsConnected")
                : tKey("shell.personalSettingsPending")}
        </strong>
      </div>
      <Field label={tKey("shell.personalSettingsTelegramId")}>
        <input className={styles.input} inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} />
      </Field>
      <label className={styles.toggleRow}>
        <input checked={active} type="checkbox" onChange={(event) => onActiveChange(event.target.checked)} />
        <span>{tKey("shell.personalSettingsTelegramActive")}</span>
      </label>
      <div className={styles.buttonRow}>
        <button className={styles.primaryButton} disabled={isSaving} onClick={onSave} type="button">
          {isSaving ? tKey("shell.personalSettingsSaving") : tKey("shell.personalSettingsSaveChannel")}
        </button>
      </div>
    </section>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}
