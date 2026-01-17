# Revonet HD Downloader - Chrome Extension

A powerful Chrome extension for downloading high-definition images from Dorotheum and Tipcars vehicle auction websites. Features automatic German-to-Italian translation, AI-powered vehicle descriptions, and optional YOLO server integration for image processing.

## Features

### Core Functionality
- **HD Image Download**: Automatically extracts and downloads high-resolution vehicle images
- **Batch Download**: Download all images from a single vehicle page as a ZIP file
- **Multi-Vehicle Support**: Select and download images from multiple vehicles at once from auction list pages
- **Smart Folder Organization**: Creates organized folders for each vehicle when downloading multiple lots

### AI-Powered Translation (DeepSeek API)
- **Vehicle Name Translation**: Automatically translates German vehicle terms to Italian
  - Kasten → Furgone
  - Maxi-Kasten → Furgone Maxi
  - LKW → Camion
  - PKW → Auto
  - Kombi → Station Wagon
  - And many more...
- **Description Generation**: Creates persuasive, professional vehicle descriptions in multiple languages
- **Multi-Language Support**: Generate descriptions in Italian, English, German, French, and Spanish

### Image Processing (Optional)
- **YOLO Server Integration**: Connect to a YOLO-powered server for automatic image processing
- **Banner/Border Removal**: Automatically crops images to focus on the vehicle, removing watermarks and borders

### User Interface
- **Real-Time Progress Bar**: Visual feedback during download with detailed status messages
- **Search & Filter**: Quickly find vehicles in large auction lists
- **Thumbnail Preview**: Visual preview of all available images before download
- **Settings Panel**: Easy configuration of API keys and preferences

## Supported Websites

- `dorotheum.com` - Austrian auction house
- `dorotheum.at` - Austrian auction house (alternate domain)
- `tipcars.com` - Vehicle marketplace

## Installation

### Method 1: Load Unpacked (Development)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **"Developer mode"** (toggle in top right corner)
4. Click **"Load unpacked"**
5. Select the `dorotheum-hd-downloader-chrome` folder

### Method 2: CRX File
1. Download the `.crx` file from releases
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **"Developer mode"**
4. Drag and drop the `.crx` file onto the page

## Configuration

### DeepSeek API Key (Required for translations)
1. Get an API key from [DeepSeek](https://platform.deepseek.com/)
2. Click the extension icon to open the popup
3. Click the **Settings** (gear) icon
4. Enter your DeepSeek API key
5. Select desired output languages
6. Click **Save**

### YOLO Server (Optional)
If you have a YOLO server for image processing:
1. Open Settings
2. Enter the server URL (e.g., `https://yolo.example.com`)
3. Enable **"Process images"** checkbox
4. Click **Save**

## Usage

### Single Vehicle Page
1. Navigate to a vehicle detail page on Dorotheum or Tipcars
2. Click the extension icon
3. View all available HD images
4. Select specific images or click **"Download all as ZIP"**
5. Optionally enable **"Include description"** for AI-generated descriptions

### Auction List Page
1. Navigate to an auction list page
2. Click the extension icon
3. Use the search box to filter vehicles
4. Select vehicles by clicking on them
5. Click **"Download X vehicles"**
6. Images will be organized in folders by vehicle name

## Technical Details

### Manifest Version
- Chrome Manifest V3 compliant
- Uses Service Worker for background processing

### Permissions
- `activeTab`: Access current tab content
- `downloads`: Save files to disk
- `storage`: Store user preferences

### Host Permissions
- `*://*.dorotheum.com/*`
- `*://*.dorotheum.at/*`
- `*://*.tipcars.com/*`

### Dependencies
- [JSZip](https://stuk.github.io/jszip/) - ZIP file generation

## File Structure

```
dorotheum-hd-downloader-chrome/
├── manifest.json          # Extension manifest (MV3)
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Popup logic and API calls
│   └── popup.css          # Popup styles
├── scripts/
│   ├── background.js      # Service worker for downloads
│   └── content.js         # Page content extraction
├── lib/
│   └── jszip.min.js       # ZIP library
└── icons/
    ├── icon-48.png        # Extension icon (48x48)
    └── icon-96.png        # Extension icon (96x96)
```

## German to Italian Translation Reference

| German | Italian |
|--------|---------|
| Kasten | Furgone |
| Maxi-Kasten | Furgone Maxi |
| Hochdach-Kasten | Furgone Tetto Alto |
| Kastenwagen | Furgone |
| LKW / Lkw | Camion |
| PKW / Pkw | Auto |
| Kombi | Station Wagon |
| Pritsche | Cassone |
| Kipper | Ribaltabile |
| Transporter | Furgone |
| Kleinbus | Minibus |
| Geländewagen | Fuoristrada |
| Sattelzugmaschine | Trattore stradale |
| Anhänger | Rimorchio |
| Limousine | Berlina |

## Troubleshooting

### Extension not working on page
- Refresh the page after installing the extension
- Check that you're on a supported website
- Ensure the page has fully loaded

### Download fails
- Check your internet connection
- Try downloading fewer images at once
- Check browser console for error messages

### Translations not working
- Verify your DeepSeek API key is correct
- Check that you have API credits remaining
- Ensure the API key has proper permissions

### ZIP file is empty
- Some images may be protected or unavailable
- Try refreshing the page and downloading again

## Privacy

This extension:
- Only accesses data on supported auction websites
- Stores settings locally in your browser
- Sends vehicle descriptions to DeepSeek API only when translation is enabled
- Does not collect or transmit any personal data

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Changelog

### v2.0.0
- Initial Chrome release (converted from Firefox)
- Chrome Manifest V3 support
- Real-time progress bar during downloads
- Improved German-Italian translation
- YOLO server integration for image processing
- Multi-language description generation
