import airQualityZhMessages from "./airQuality.zh.json";
import assistantZhMessages from "./assistant.zh.json";
import authZhMessages from "./auth.zh.json";
import cityServicesZhMessages from "./cityServices.zh.json";
import dataHelpZhMessages from "./dataHelp.zh.json";
import energyZhMessages from "./energy.zh.json";
import geospatialZhMessages from "./geospatial.zh.json";
import labelsZhMessages from "./labels.zh.json";
import linkedEventsZhMessages from "./linkedEvents.zh.json";
import mobilityZhMessages from "./mobility.zh.json";
import regionalProfileZhMessages from "./regionalProfile.zh.json";
import roadRailZhMessages from "./roadRail.zh.json";
import shellZhMessages from "./shell.zh.json";
import transitZhMessages from "./transit.zh.json";
import waterSnowZhMessages from "./waterSnow.zh.json";
import weatherZhMessages from "./weather.zh.json";
import zhMessages from "./zh.json";

import type { MessageCatalog } from "../i18n";

export const zhCatalog: MessageCatalog = {
  legacy: zhMessages,
  structured: {
    ...shellZhMessages,
    ...weatherZhMessages,
    ...energyZhMessages,
    ...transitZhMessages,
    ...mobilityZhMessages,
    ...roadRailZhMessages,
    ...airQualityZhMessages,
    ...linkedEventsZhMessages,
    ...waterSnowZhMessages,
    ...regionalProfileZhMessages,
    ...geospatialZhMessages,
    ...cityServicesZhMessages,
    ...dataHelpZhMessages,
    ...authZhMessages,
    ...assistantZhMessages,
    ...labelsZhMessages,
  },
};
