// Usage: wkprint <url> <out.pdf> [js-to-run-before-print]
// Loads a page in WebKit (Safari's engine) and prints it via NSPrintOperation to a PDF.
import AppKit
import WebKit

let args = CommandLine.arguments
let url = URL(string: args[1])!, out = URL(fileURLWithPath: args[2])
let preJS = args.count > 3 ? args[3] : nil

class Runner: NSObject, WKNavigationDelegate {
  let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 1000), styleMask: [.titled], backing: .buffered, defer: false)
  let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 1000))
  func start() { window.contentView = web; web.navigationDelegate = self; web.load(URLRequest(url: url)) }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      if let js = preJS {
        w.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { res in
          switch res { case .failure(let e): print("JS error:", e); case .success(let v): print("JS result:", v ?? "nil") }
          DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.printIt() }
        }
      } else { self.printIt() }
    }
  }
  func printIt() {
    let info = NSPrintInfo.shared.copy() as! NSPrintInfo
    info.jobDisposition = .save
    info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = out
    info.paperSize = NSSize(width: 612, height: 792)
    let op = web.printOperation(with: info)
    op.showsPrintPanel = false; op.showsProgressPanel = false
    op.view?.frame = web.bounds
    op.runModal(for: window, delegate: self, didRun: #selector(done(_:success:contextInfo:)), contextInfo: nil)
  }
  @objc func done(_ op: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) { print("printed:", success); exit(0) }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let r = Runner(); r.start()
DispatchQueue.main.asyncAfter(deadline: .now() + 120) { print("timeout"); exit(1) }
app.run()
