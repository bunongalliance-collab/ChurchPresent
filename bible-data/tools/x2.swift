import PDFKit
let d = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1]))!
var all = ""
for i in 0..<d.pageCount {
  let p = d.page(at: i)!; let b = p.bounds(for: .cropBox)
  all += "\n=====PAGE \(i+1)=====\n"
  for half in 0..<2 {
    let r = CGRect(x: b.minX + CGFloat(half) * b.width/2, y: b.minY, width: b.width/2, height: 565 - b.minY)
    all += (p.selection(for: r)?.string ?? "") + "\n"
  }
}
try! all.write(toFile: CommandLine.arguments[2], atomically: true, encoding: .utf8)
