# Image Handling in LLMS Transformers

## Overview
This document describes how different LLM providers handle image inputs and the token optimization strategies employed.

## OpenAI (GPT-4/GPT-5 Vision)

### Detail Parameter Options
- **`"low"`**: Images downsampled to 512×512 px, uses flat 85 tokens
- **`"high"`**: Images resized to fit 2048×2048, then divided into 512px tiles @ 170 tokens each
- **`"auto"`** (default): Automatically selects based on image size
  - Algorithm not publicly documented
  - Generally uses "low" for small images, "high" for larger ones
  - Exact threshold unknown but appears to be around 512×512 px

### Implementation in LLMS
```javascript
// In openai.transformer.ts
image_url: {
  url: imageUrl,
  detail: 'auto'  // Let OpenAI optimize for token usage
}
```

### Token Usage
- Low resolution: 85 tokens flat
- High resolution: 170 tokens per 512×512 tile
- Auto: Dynamically selected

## Anthropic Claude

### Automatic Processing
- **No user control** - always automatic
- Downsamples when images exceed:
  - 1568 pixels on the long edge
  - ~1,600 tokens

### Token Calculation
```
tokens = (width × height) / 750
```

### Limits
- Max size: 8000×8000 px (single image)
- Max size: 2000×2000 px (when sending 20+ images)
- Recommended: Keep under 1.15 megapixels (1568×1568 px)

## Comparison

| Feature | OpenAI | Anthropic |
|---------|---------|-----------|
| User Control | Yes (`detail` parameter) | No (automatic) |
| Default Behavior | `auto` - smart selection | Auto downsample >1568px |
| Low Quality Option | Yes (`detail: "low"`) | No |
| High Quality Option | Yes (`detail: "high"`) | No (always optimizes) |
| Token Calculation | Varies by mode | (w × h) / 750 |
| Max Resolution | 2048×2048 (high mode) | 8000×8000 (but downsampled) |

## Best Practices

### For OpenAI
1. Use `detail: "auto"` for most cases
2. Use `detail: "low"` for thumbnails or when detail isn't critical
3. Use `detail: "high"` only when fine detail analysis is required

### For Anthropic
1. Pre-resize images to 1568×1568 px or smaller to avoid latency
2. Keep total pixels under 1.15 megapixels
3. Batch multiple small images rather than one large image

## Token Optimization Tips

1. **Pre-process large images**: Resize before sending to avoid surprise token usage
2. **Use appropriate quality**: Not all tasks need high resolution
3. **Monitor token usage**: Images can quickly consume context windows
4. **Consider alternatives**: For very large images, consider:
   - Cropping to relevant sections
   - Creating multiple focused views
   - Using lower resolution for initial analysis

## Error Handling

### Common Issues
- **`context_length_exceeded`**: Image too large for model's context
  - Solution: Use lower detail setting or resize image
- **`invalid_image_url`**: Malformed image data
  - Solution: Ensure proper base64 encoding with data URI prefix
- **Size rejection**: Image exceeds provider limits
  - Solution: Pre-resize to provider's maximum dimensions