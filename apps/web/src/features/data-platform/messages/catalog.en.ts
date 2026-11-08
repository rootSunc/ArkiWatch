import airQualityEnMessages from "./airQuality.en.json";
import assistantEnMessages from "./assistant.en.json";
import authEnMessages from "./auth.en.json";
import cityServicesEnMessages from "./cityServices.en.json";
import dataHelpEnMessages from "./dataHelp.en.json";
import energyEnMessages from "./energy.en.json";
import enMessages from "./en.json";
import geospatialEnMessages from "./geospatial.en.json";
import labelsEnMessages from "./labels.en.json";
import linkedEventsEnMessages from "./linkedEvents.en.json";
import mobilityEnMessages from "./mobility.en.json";
import regionalProfileEnMessages from "./regionalProfile.en.json";
import roadRailEnMessages from "./roadRail.en.json";
import shellEnMessages from "./shell.en.json";
import transitEnMessages from "./transit.en.json";
import waterSnowEnMessages from "./waterSnow.en.json";
import weatherEnMessages from "./weather.en.json";

import type { MessageCatalog } from "../i18n";

export const enCatalog: MessageCatalog = {
  legacy: enMessages,
  structured: {
    ...shellEnMessages,
    ...weatherEnMessages,
    ...energyEnMessages,
    ...transitEnMessages,
    ...mobilityEnMessages,
    ...roadRailEnMessages,
    ...airQualityEnMessages,
    ...linkedEventsEnMessages,
    ...waterSnowEnMessages,
    ...regionalProfileEnMessages,
    ...geospatialEnMessages,
    ...cityServicesEnMessages,
    ...dataHelpEnMessages,
    ...authEnMessages,
    ...assistantEnMessages,
    ...labelsEnMessages,
  },
};
