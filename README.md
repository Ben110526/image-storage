# ImgStore — Modern Cloud Image & File Storage

> A lightweight, elegant image and document storage service powered by Cloudflare Workers and Google Drive, featuring a Liquid Glass user interface.

- **Web App**: [imgstore-web.xlabaryai.workers.dev](https://imgstore-web.xlabaryai.workers.dev)
- **API**: [imgstore-api.xlabaryai.workers.dev](https://imgstore-api.xlabaryai.workers.dev)

---

## 🌟 What is ImgStore?

ImgStore is an easy-to-use cloud storage platform designed for uploading, organizing, converting, and sharing images and documents.

All files are securely stored on cloud storage managed by the administrator, while **every user enjoys their own private, isolated workspace**. You do not need a personal Google account or extra cloud storage — all you need is an access key provided by your admin.

---

## 🚀 How to Use (Web App)

Using ImgStore is simple and straightforward:

1. **Connect**: Open the website and click **Connect with API key** in the top navigation. Enter the access key provided to you by your administrator.
2. **Upload**: Drag and drop your images or files into the upload area, paste them directly, or enter an image URL to import from the web.
3. **Organize**: Keep your files tidy by creating custom folders and nested subfolders, or let the app automatically organize uploads by month (`uploads/YYYY-MM`).
4. **Share**: Click on any image to preview it in high resolution, or click **Copy link** to copy a direct, high-speed CDN sharing link.
5. **Convert Formats**: Need to convert a file?
   - Open the **Convert** tab to quickly convert images (PNG, JPEG to WebP/AVIF) or documents (DOCX, XLSX to PDF) on the fly without saving them to your library.
   - Or click **Convert** directly on any existing file in your library.

---

## ✨ Key Features

- ⚡ **High-Speed CDN Delivery**: Fast global access and direct sharing links for all your media.
- 📁 **Effortless Organization**: Create nested folders, browse by folder hierarchy, and filter files instantly.
- 🔄 **Built-in Quick Converter**: Convert document and image formats directly in your browser.
- 🎨 **Liquid Glass Interface**: A responsive, modern design with smooth animations that looks great on both desktop and mobile.
- 🔒 **Privacy & Isolation**: Each user can only view and manage their own files.
- 📱 **Mobile Friendly**: Optimized touch targets, mobile navigation, and responsive bottom sheets.

---

## 🔑 For Administrators

Administrators manage user access keys and overall storage:

- **Sign In as Admin**: Connect using your Admin Key.
- **Issue User Keys**: Go to **API Specs & Tools → Issue client API keys**, enter a name for the person or app, and generate a new key.
- **Revoke Access**: Revoke keys at any time with one click. Revoking a key removes access but safely preserves uploaded files.

---

## 💻 For Developers (API Quickstart)

You can easily integrate ImgStore into your own apps and scripts using standard REST requests:

### Upload an Image
```sh
curl https://imgstore-api.xlabaryai.workers.dev/upload \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "file=@/path/to/image.png"
```

### List Your Files
```sh
curl https://imgstore-api.xlabaryai.workers.dev/images \
  -H "X-API-Key: YOUR_API_KEY"
```

### Quick Format Conversion (No Library Storage)
```sh
curl https://imgstore-api.xlabaryai.workers.dev/convert \
  -H "X-API-Key: YOUR_API_KEY" \
  -F "file=@document.docx" \
  -F "format=pdf" \
  --output result.pdf
```

---

## 🛠️ Project Structure

- `imgstore-web/` — React + TypeScript frontend (Vite, Tailwind CSS, Liquid Glass design system).
- `imgstore-api/` — Backend API built on Cloudflare Workers and Hono.
- `docs/` — Specifications and design tokens documentation.
- `scripts/` — Development and build scripts.

### Local Development

Requirements: **Node.js 22.13+** and **npm**.

```sh
# Install dependencies for both web and api
npm run setup

# Start local development servers
npm run dev

# Run quality checks (typecheck, tests, lint, build)
npm run check
```

---

## 📄 License

Private project. All rights reserved.
