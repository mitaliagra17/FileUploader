import { LightningElement, api } from 'lwc';

export default class PreviewFileModal extends LightningElement {
    @api url;
    @api fileExtension;
    @api currentFileIndex;
    @api tableFiles = [];
    isPreviousDisabled = true;
    isNextDisabled = false;
    showFrame = false;
    showModal = false;
    isLoading = false;
    isPreviewAvailable = false;
    domainUrl = window.location.origin;
    downloadUrl;
    modalStyle = '';
    hasRendered = false;

    renderedCallback() {
        if (this.hasRendered) {
            return;
        }

        const arrowButtons = this.template.querySelectorAll('.arrow-button');

        if (arrowButtons.length > 0) {
            const STYLE = document.createElement('style');
            STYLE.innerText = `.slds-button_icon-border {
            border: 0px;
        }`;
            arrowButtons.forEach(button => button.appendChild(STYLE));
            this.hasRendered = true; // Prevent further execution
        } else {
            console.error('Arrow buttons not found');
        }
    }


    @api show(url, fileExtension, currentFileIndex, tableFiles) {
        this.url = url;
        this.fileExtension = fileExtension;
        this.currentFileIndex = currentFileIndex;
        this.tableFiles = tableFiles;
        this.downloadUrl = this.domainUrl + this.url;

        this.checkFileType();

        this.updateArrowButtons();
        window.scrollTo(0, 0);
        this.isLoading = true;
        this.showModal = false;

        setTimeout(() => {
            this.isLoading = false;
            this.showModal = true;
            this.setModalWidth();
        }, 3000);
    }

    setModalWidth() {
        const windowWidth = window.innerWidth;
        const modalWidth = windowWidth * 0.9;

        this.modalStyle = `width: ${modalWidth}px; max-width:100%; margin: auto;`;
    }

    checkFileType() {
        if (this.fileExtension === 'pdf') {
            this.showFrame = true;
            this.isPreviewAvailable = true;
        }
        else if (this.fileExtension.match(/(jpg|jpeg|png|gif|bmp|svg|tiff)/)) {
            this.showFrame = false;
            this.isPreviewAvailable = true;
        } else {
            this.showFrame = false;
            this.isPreviewAvailable = false;
        }
    }

    handleNext() {
        if (this.currentFileIndex < this.tableFiles.length - 1) {
            this.currentFileIndex++;
            const nextFile = this.tableFiles[this.currentFileIndex];
            this.show(nextFile.downloadUrl, nextFile.type, this.currentFileIndex, this.tableFiles);
        }
    }

    handlePrevious() {
        if (this.currentFileIndex > 0) {
            this.currentFileIndex--;
            const prevFile = this.tableFiles[this.currentFileIndex];
            this.show(prevFile.downloadUrl, prevFile.type, this.currentFileIndex, this.tableFiles);
        }
    }

    updateArrowButtons() {
        this.isPreviousDisabled = this.currentFileIndex === 0;
        this.isNextDisabled = this.currentFileIndex === this.tableFiles.length - 1;
    }

    get modalContentClasses() {
        return `slds-modal__content ${!this.isPreviewAvailable ? 'no-scroll' : 'yes-scroll'}`;
    }

    closeModal() {
        this.showModal = false;
    }
}