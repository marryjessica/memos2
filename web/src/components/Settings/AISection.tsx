import { create } from "@bufbuild/protobuf";
import { isEqual } from "lodash-es";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInstance } from "@/contexts/InstanceContext";
import { handleError } from "@/lib/error";
import {
  InstanceSetting_AISetting,
  InstanceSetting_AISettingSchema,
  InstanceSetting_Key,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import SettingRow from "./SettingRow";
import SettingSection from "./SettingSection";

const AISection = () => {
  const t = useTranslate();
  const { aiSetting: originalSetting, updateSetting, fetchSetting } = useInstance();
  const [aiSetting, setAiSetting] = useState<InstanceSetting_AISetting>(originalSetting);

  useEffect(() => {
    setAiSetting(originalSetting);
  }, [originalSetting]);

  const updatePartialSetting = (partial: Partial<InstanceSetting_AISetting>) => {
    setAiSetting(
      create(InstanceSetting_AISettingSchema, {
        ...aiSetting,
        ...partial,
      }),
    );
  };

  const handleSaveAISetting = async () => {
    try {
      await updateSetting(
        create(InstanceSettingSchema, {
          name: `instance/settings/${InstanceSetting_Key[InstanceSetting_Key.AI]}`,
          value: {
            case: "aiSetting",
            value: aiSetting,
          },
        }),
      );
      await fetchSetting(InstanceSetting_Key.AI);
    } catch (error: unknown) {
      await handleError(error, toast.error, {
        context: "Update AI settings",
      });
      return;
    }
    toast.success(t("message.update-succeed"));
  };

  return (
    <SettingSection>
      <SettingGroup title="OpenAI Configuration">
        <SettingRow label="API Key">
          <Input
            className="font-mono"
            type="password"
            placeholder="sk-..."
            value={aiSetting.openaiApiKey}
            onChange={(e) => updatePartialSetting({ openaiApiKey: e.target.value })}
          />
        </SettingRow>

        <SettingRow label="Base URL" description="Optional, default to https://api.openai.com/v1">
          <Input
            className="font-mono"
            placeholder="https://api.openai.com/v1"
            value={aiSetting.openaiBaseUrl}
            onChange={(e) => updatePartialSetting({ openaiBaseUrl: e.target.value })}
          />
        </SettingRow>

        <SettingRow label="Model" description="Optional, default to gpt-3.5-turbo">
          <Input
            className="font-mono"
            placeholder="gpt-3.5-turbo"
            value={aiSetting.openaiModel}
            onChange={(e) => updatePartialSetting({ openaiModel: e.target.value })}
          />
        </SettingRow>
      </SettingGroup>

      <div className="w-full flex justify-end">
        <Button disabled={isEqual(aiSetting, originalSetting)} onClick={handleSaveAISetting}>
          {t("common.save")}
        </Button>
      </div>
    </SettingSection>
  );
};

export default AISection;
