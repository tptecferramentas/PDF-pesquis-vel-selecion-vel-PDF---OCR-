// Configuração do PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('page-loader');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 400);
});

// ================= CONTROLE DOS MODAIS =================

// Modal de Orçamento
const openBudgetBtn = document.getElementById('open-budget-modal');
const budgetModal = document.getElementById('budget-modal');
const closeBudgetBtn = document.getElementById('close-budget');

if(openBudgetBtn) openBudgetBtn.addEventListener('click', () => budgetModal.classList.add('active'));
if(closeBudgetBtn) closeBudgetBtn.addEventListener('click', () => budgetModal.classList.remove('active'));

// Modal de Suporte / Contato
const openSupportBtn = document.getElementById('open-support-modal');
const supportModal = document.getElementById('support-modal');
const closeSupportBtn = document.getElementById('close-support');

if(openSupportBtn) openSupportBtn.addEventListener('click', () => supportModal.classList.add('active'));
if(closeSupportBtn) closeSupportBtn.addEventListener('click', () => supportModal.classList.remove('active'));

// Fechar os modais ao clicar fora do conteúdo
window.addEventListener('click', (e) => {
    if (e.target === budgetModal) budgetModal.classList.remove('active');
    if (e.target === supportModal) supportModal.classList.remove('active');
});

// ================= FIM DO CONTROLE DOS MODAIS =================

// Controle de Drag & Drop
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controlPanel = document.getElementById('control-panel');
const fileInfo = document.getElementById('file-info');
let currentFile = null;

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        handleFileSelection(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileSelection(e.target.files[0]);
    }
});

function handleFileSelection(file) {
    if (file.type !== "application/pdf") {
        alert("Por favor, selecione apenas arquivos PDF.");
        return;
    }
    currentFile = file;
    fileInfo.textContent = `📄 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    dropZone.style.display = 'none';
    controlPanel.style.display = 'block';
    
    document.getElementById('download-link').style.display = 'none';
    document.getElementById('progress-container').style.display = 'none';
    document.getElementById('start-ocr-btn').disabled = false;
}

// Lógica Principal de OCR com captura total (Cabeçalho, Rodapé e Margens)
const startBtn = document.getElementById('start-ocr-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const downloadLink = document.getElementById('download-link');
const langSelect = document.getElementById('lang-select');

// Substitua o trecho dentro do evento 'click' do startBtn por este bloco mais seguro:

startBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    startBtn.disabled = true;
    progressContainer.style.display = 'block';
    downloadLink.style.display = 'none';
    const language = langSelect.value;

    try {
        progressText.innerText = "Lendo o PDF original...";
        progressBar.style.width = "5%";

        const arrayBuffer = await currentFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const numPages = pdf.numPages;
        
        const pdfDoc = await PDFLib.PDFDocument.create();
        const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

        progressText.innerText = "Carregando motor OCR e idioma...";
        const worker = await Tesseract.createWorker();
        await worker.loadLanguage(language);
        await worker.initialize(language);
        
        // Tente alterar o valor para '1'. 
        // Se ainda falhar nas bordas, mude para '12' ou '11'.
        await worker.setParameters({
            tessedit_pageseg_mode: '1', 
        });

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            progressText.innerText = `Processando página ${pageNum} de ${numPages}...`;
            let percent = 10 + ((pageNum - 1) / numPages) * 85;
            progressBar.style.width = `${percent}%`;

            const page = await pdf.getPage(pageNum);
            
            // CORREÇÃO 2: Aumentado de 2.0 para 3.5 para melhor captura de detalhes
            const scale = 3.5; 
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);

            const { data: { words } } = await worker.recognize(imageDataUrl);

            const origViewport = page.getViewport({ scale: 1.0 });
            const newPage = pdfDoc.addPage([origViewport.width, origViewport.height]);
            
            for (const word of words) {
                const x = (word.bbox.x0 / scale);
                const y = origViewport.height - (word.bbox.y1 / scale);
                const height = (word.bbox.y1 - word.bbox.y0) / scale;

                newPage.drawText(word.text, {
                    x: x,
                    y: y,
                    size: height > 0 ? height : 8,
                    font: font,
                    color: PDFLib.rgb(1, 1, 1),
                    opacity: 0 
                });
            }

            const imageBytes = Uint8Array.from(atob(imageDataUrl.split(',')[1]), c => c.charCodeAt(0));
            const embedImage = await pdfDoc.embedJpg(imageBytes);
            newPage.drawImage(embedImage, {
                x: 0,
                y: 0,
                width: origViewport.width,
                height: origViewport.height
            });
        }

        await worker.terminate();

        progressText.innerText = "Montando arquivo final...";
        progressBar.style.width = "98%";

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        progressText.innerText = "Concluído com sucesso!";
        progressBar.style.width = "100%";

        downloadLink.href = url;
        downloadLink.download = currentFile.name.replace('.pdf', '_pesquisavel.pdf');
        downloadLink.style.display = 'block';

    } catch (error) {
        console.error("Erro detalhado do OCR:", error);
        alert("Ocorreu um erro ao processar o arquivo. Verifique o console (F12) para mais detalhes ou teste com um arquivo menor.");
        progressText.innerText = "Erro no processamento.";
        progressBar.style.background = "red";
    } finally {
        startBtn.disabled = false;
        startBtn.innerText = "Processar Novo Arquivo";
    }
});