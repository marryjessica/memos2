package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/pkg/errors"
	"github.com/usememos/memos/store"
)

type AIService struct {
	store *store.Store
}

func NewAIService(store *store.Store) *AIService {
	return &AIService{store: store}
}

type OpenAIRequest struct {
	Model    string          `json:"model"`
	Messages []OpenAIMessage `json:"messages"`
}

type OpenAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type OpenAIResponse struct {
	Choices []struct {
		Message OpenAIMessage `json:"message"`
	} `json:"choices"`
}

func (s *AIService) GenerateTags(ctx context.Context, content string) ([]string, error) {
	aiSetting, err := s.store.GetInstanceAISetting(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get instance ai setting")
	}
	if aiSetting == nil || aiSetting.OpenaiApiKey == "" {
		return nil, nil
	}

	// Fetch existing tags from recent memos to provide context
	existingTags, err := s.getRecentTags(ctx)
	if err != nil {
		// Log error but proceed without tags
		fmt.Printf("failed to get recent tags: %v\n", err)
	}

	prompt := fmt.Sprintf(`# Goal
根据用户输入的【待办内容】，为其匹配最精准的一个标签（Tag）。

# Data
1. 待办内容： {{content}}
2. 已有标签列表： {{existing_tags}}

# Rules
1. **语义匹配（核心原则）**：首先检查【已有标签列表】中是否有标签能**精准概括**待办内容。
2. **禁止强行匹配**：如果已有标签与内容只有微弱关联（例如：将“交水费”归类为“购物”）或完全无关，**请立即忽略已有标签**。
3. **新建标签**：当没有完美匹配的已有标签时，**必须**根据内容生成一个新的标签。新标签应为 2-4 个字的中文词汇（如：#物业、#缴费、#家务）。
4. **数量限制**：只返回 1 个最准确的标签。

# Output Format
仅返回标签文本，不包含任何解释或符号。

现在请分析：
待办内容： %s
已有标签： %s`, content, strings.Join(existingTags, ", "))

	baseURL := aiSetting.OpenaiBaseUrl
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	// Ensure baseURL does not end with slash if we append path, but usually it's passed as base
	// We append /chat/completions
	apiURL := fmt.Sprintf("%s/chat/completions", strings.TrimRight(baseURL, "/"))

	model := aiSetting.OpenaiModel
	if model == "" {
		model = "gpt-3.5-turbo"
	}

	reqBody := OpenAIRequest{
		Model: model,
		Messages: []OpenAIMessage{
			{Role: "system", Content: "你是一个文本标签提取工具，任务是从输入文本中提取核心标签，输出内容仅限标签，无其他多余文字。"},
			{Role: "user", Content: prompt},
		},
	}
	jsonBody, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, errors.Wrap(err, "failed to create request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", aiSetting.OpenaiApiKey))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.Wrap(err, "failed to call AI API")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, errors.Errorf("AI API failed with status %d: %s", resp.StatusCode, string(body))
	}

	var aiResp OpenAIResponse
	if err := json.NewDecoder(resp.Body).Decode(&aiResp); err != nil {
		return nil, errors.Wrap(err, "failed to decode response")
	}

	if len(aiResp.Choices) == 0 {
		return nil, nil
	}

	tagStr := aiResp.Choices[0].Message.Content
	return parseTags(tagStr), nil
}

func (s *AIService) getRecentTags(ctx context.Context) ([]string, error) {
	limit := 100
	offset := 0
	list, err := s.store.ListMemos(ctx, &store.FindMemo{
		Limit:  &limit,
		Offset: &offset,
	})
	if err != nil {
		return nil, err
	}

	tagCount := make(map[string]int)
	tagRegex := regexp.MustCompile(`#(\S+)`)

	for _, memo := range list {
		matches := tagRegex.FindAllStringSubmatch(memo.Content, -1)
		for _, match := range matches {
			if len(match) > 1 {
				tag := match[1]
				tagCount[tag]++
			}
		}
	}

	type tagFreq struct {
		Tag   string
		Count int
	}
	var tags []tagFreq
	for t, c := range tagCount {
		tags = append(tags, tagFreq{t, c})
	}
	sort.Slice(tags, func(i, j int) bool {
		return tags[i].Count > tags[j].Count
	})

	result := []string{}
	for i, t := range tags {
		if i >= 10 {
			break
		}
		result = append(result, "#"+t.Tag)
	}
	return result, nil
}

func parseTags(input string) []string {
	// Simple parsing: extract words starting with #
	// Or just split by space/comma and ensure they start with #
	// If AI returns "tag1, tag2", we prepend # if missing

	// Normalize separators
	input = strings.ReplaceAll(input, ",", " ")
	parts := strings.Fields(input)
	var tags []string
	for _, p := range parts {
		if p == "" {
			continue
		}
		if !strings.HasPrefix(p, "#") {
			p = "#" + p
		}
		tags = append(tags, p)
	}
	return tags
}
