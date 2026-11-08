import "@testing-library/jest-dom/vitest";

import { installMessageCatalog } from "@/features/data-platform/i18n";
import { enCatalog } from "@/features/data-platform/messages/catalog.en";
import { zhCatalog } from "@/features/data-platform/messages/catalog.zh";

installMessageCatalog("en", enCatalog);
installMessageCatalog("zh", zhCatalog);
