import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiClient, attachmentFilename } from "./client"


afterEach(() => {
  vi.restoreAllMocks()
})


describe("attachmentFilename", () => {
  it("reads the name the server proposes", () => {
    expect(attachmentFilename('attachment; filename="senda-caso-3F2A9C1B.pdf"')).toBe(
      "senda-caso-3F2A9C1B.pdf",
    )
  })

  it("returns null when there is no name to read", () => {
    expect(attachmentFilename(null)).toBeNull()
    expect(attachmentFilename("inline")).toBeNull()
  })
})


describe("ApiClient.downloadFile", () => {
  it("returns the file together with its proposed name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("%PDF-", {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="senda-caso-3F2A9C1B.pdf"',
        },
      }),
    )

    const { blob, filename } = await new ApiClient("").downloadFile("/api/v1/cases/x/report")

    expect(filename).toBe("senda-caso-3F2A9C1B.pdf")
    expect(await blob.text()).toBe("%PDF-")
  })

  it("surfaces the server's reason when it refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Sin acceso a este caso" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    )

    await expect(
      new ApiClient("").downloadFile("/api/v1/cases/x/report"),
    ).rejects.toThrow("Sin acceso a este caso")
  })
})
