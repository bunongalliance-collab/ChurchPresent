// Usage: swift extract.swift <outDir> <pdf>...  Writes <outDir>/<name>.cols.txt (column by column, header band cut off) and <name>.page1.txt
import PDFKit
let out = CommandLine.arguments[1]
for path in CommandLine.arguments.dropFirst(2) {
  guard let d = PDFDocument(url: URL(fileURLWithPath: path)) else { print("CANNOT OPEN \(path)"); continue }
  let name = (path as NSString).lastPathComponent
  var all = ""
  for i in 0..<d.pageCount {
    let p = d.page(at: i)!; let b = p.bounds(for: .cropBox)
    all += "\n=====PAGE \(i+1)=====\n"
    // Footnotes ("a 3:20 …") run across the bottom of the page: cut that band off the columns and keep it apart
    let fullLines = p.selection(for: b)?.selectionsByLine() ?? []
    let footRe = try! NSRegularExpression(pattern: "^[a-z] ?[0-9]+[:.] ?[0-9]+(-[0-9]+)?[a-z]?( |$)")
    var footTop = b.minY
    // Page 1: the book title lines are centred, so they cross the middle of the page; column text never does
    var bodyTop = b.maxY - 30
    if i == 0 {
      var title: [(CGFloat, String)] = []
      // Walk down from the top: centred lines narrower than the two columns together are the title; stop at the first that is not
      let sorted = fullLines.sorted { $0.bounds(for: p).midY > $1.bounds(for: p).midY }
      for ln in sorted {
        let bb = ln.bounds(for: p); let t = (ln.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if bb.minY > b.maxY - 30 || t.isEmpty || t.allSatisfy({ $0.isNumber }) { continue }   // header band, page number
        if bb.minX < b.midX - 4 && bb.maxX > b.midX + 4 && bb.width < b.width * 0.72 { title.append((bb.midY, t)); bodyTop = min(bodyTop, bb.minY) } else { break }
      }
      title.sort { $0.0 > $1.0 }
      try! title.map { $0.1 }.joined(separator: "\n").write(toFile: "\(out)/\(name).title.txt", atomically: true, encoding: .utf8)
    }
    for ln in fullLines {
      let t = ln.string ?? ""
      if footRe.firstMatch(in: t, range: NSRange(t.startIndex..., in: t)) != nil { footTop = max(footTop, ln.bounds(for: p).maxY) }
    }
    var foot: [String] = []
    if footTop > b.minY {
      for ln in fullLines where ln.bounds(for: p).midY < footTop { foot.append((ln.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) }
    }
    for half in 0..<2 {
      let r = CGRect(x: b.minX + CGFloat(half) * b.width/2, y: footTop + 0.5, width: b.width/2, height: bodyTop - footTop - 0.5)
      // Rebuild lines by position: pieces on the same baseline (a verse number in its own gutter and its text) are joined, top to bottom
      var items: [(y: CGFloat, x: CGFloat, s: String)] = []
      for ln in p.selection(for: r)?.selectionsByLine() ?? [] {
        let bb = ln.bounds(for: p); let t = (ln.string ?? "").trimmingCharacters(in: .newlines)
        if !t.isEmpty { items.append((bb.midY, bb.minX, t)) }
      }
      items.sort { abs($0.y - $1.y) > 2.5 ? $0.y > $1.y : $0.x < $1.x }
      var rows: [(y: CGFloat, s: String)] = []
      for it in items {
        if let last = rows.last, abs(last.y - it.y) <= 2.5 { rows[rows.count-1].s += " " + it.s } else { rows.append((it.y, it.s)) }
      }
      all += rows.map { $0.s }.joined(separator: "\n") + "\n"
    }
    if !foot.isEmpty { all += "=====FOOT=====\n" + foot.joined(separator: "\n") + "\n=====ENDFOOT=====\n" }
  }
  // Running header band (book name + chapter numbers), used only to read the book's own name
  var heads = ""
  for i in 0..<d.pageCount {
    let p = d.page(at: i)!; let b = p.bounds(for: .cropBox)
    heads += (p.selection(for: CGRect(x: b.minX, y: b.maxY - 30, width: b.width, height: 30))?.string ?? "").replacingOccurrences(of: "\n", with: " ") + "\n"
  }
  try! heads.write(toFile: "\(out)/\(name).header.txt", atomically: true, encoding: .utf8)
  try! all.write(toFile: "\(out)/\(name).cols.txt", atomically: true, encoding: .utf8)
  try! (d.page(at: 0)?.string ?? "").write(toFile: "\(out)/\(name).page1.txt", atomically: true, encoding: .utf8)
  print("ok \(name) \(d.pageCount)p")
}
