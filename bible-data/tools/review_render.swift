// Render the PDF page of each sample verse as a JPEG, with the start of the verse marked.
// Usage: swift review_render.swift <churchApp dir> <sample.json> <outDir>
import PDFKit
import AppKit
let root = CommandLine.arguments[1], out = CommandLine.arguments[3]
let items = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))) as! [[String: Any]]
for (n, it) in items.enumerated() {
  let doc = PDFDocument(url: URL(fileURLWithPath: root + "/" + (it["pdf"] as! String)))!
  let page = doc.page(at: (it["page"] as! Int) - 1)!
  let box = page.bounds(for: .cropBox)
  var mark: CGRect? = nil
  search: for f in it["find"] as! [String] {
    for sel in doc.findString(f, withOptions: []) where sel.pages.contains(page) { mark = sel.bounds(for: page); break search }
  }
  let scale: CGFloat = 2.2
  let img = NSImage(size: NSSize(width: box.width * scale, height: box.height * scale))
  img.lockFocus()
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.setFillColor(NSColor.white.cgColor); ctx.fill(CGRect(x: 0, y: 0, width: box.width * scale, height: box.height * scale))
  ctx.scaleBy(x: scale, y: scale); ctx.translateBy(x: -box.minX, y: -box.minY)
  page.draw(with: .cropBox, to: ctx)
  if let m = mark {
    ctx.setFillColor(NSColor(calibratedRed: 1, green: 0.85, blue: 0, alpha: 0.35).cgColor); ctx.fill(m.insetBy(dx: -2, dy: -1))
    ctx.setFillColor(NSColor(calibratedRed: 0.85, green: 0.1, blue: 0.1, alpha: 0.9).cgColor); ctx.fill(CGRect(x: box.minX + 2, y: m.minY - 1, width: 4, height: m.height + 2))
  }
  img.unlockFocus()
  let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
  try! rep.representation(using: .jpeg, properties: [.compressionFactor: 0.72])!.write(to: URL(fileURLWithPath: "\(out)/v\(n).jpg"))
  print(n, it["ref"]!, mark == nil ? "NO MARK" : "marked")
}
