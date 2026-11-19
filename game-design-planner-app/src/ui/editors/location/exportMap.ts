import JSZip from 'jszip'
import type { Entity, Project } from '../../../core/model/types'
import { locationJson } from '../../../core/location/export/json'
import { tiledMap, tilesetSvg } from '../../../core/location/export/tiled'
import { universalVtt } from '../../../core/location/export/vtt'
import { mapNav } from '../../../core/location/analysis'
import { toSvgString } from '../../../core/location/render/node'
import { renderMap } from '../../../core/location/render/svg'
import type { LocationMap } from '../../../core/location/types'
import { downloadBlob, downloadText } from '../../../core/persistence/file'

/**
 * Exports of one location map, from the Map view's Export menu. The data formats are built in core/location/export;
 * this file adds what needs the browser: drawing the SVG into a PNG on a canvas, zipping, and downloading.
 */
export const EXPORTS = [
  { id: 'svg', label: 'Map picture (SVG)' },
  { id: 'svg-player', label: 'Player map (SVG)' },
  { id: 'png', label: 'Map picture (PNG, large)' },
  { id: 'png-player', label: 'Player map (PNG, large)' },
  { id: 'json', label: 'Engine data (JSON)' },
  { id: 'tiled', label: 'Tiled map, for Unity and Godot (.zip)' },
  { id: 'uvtt', label: 'Virtual tabletop: Foundry, Roll20 (.dd2vtt)' },
] as const
export type ExportId = (typeof EXPORTS)[number]['id']

const fileBase = (location: Entity) => String(location.name ?? 'location').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'location'

/** Draws an SVG into a PNG `scale` times its size. */
export function svgToPng(svg: string, w: number, h: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No canvas'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The map picture could not be drawn'))
    }
    img.src = url
  })
}

const asBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/** The map drawn as SVG text, with its pixel size. */
function picture(project: Project, location: Entity, map: LocationMap, o: { player?: boolean; bare?: boolean }) {
  const r = renderMap(project, location, map, { ...o, uid: 'export' })
  return { svg: toSvgString({ ...r.node, attrs: { ...r.node.attrs, width: r.w, height: r.h } }), w: r.w, h: r.h }
}

export async function runExport(id: ExportId, project: Project, location: Entity, map: LocationMap): Promise<void> {
  const name = fileBase(location)
  const player = id.endsWith('-player')
  if (id === 'svg' || id === 'svg-player') return downloadText(`${name}${player ? ' (player)' : ''}.svg`, picture(project, location, map, { player }).svg, 'image/svg+xml')
  if (id === 'png' || id === 'png-player') {
    const p = picture(project, location, map, { player })
    return downloadBlob(`${name}${player ? ' (player)' : ''}.png`, await svgToPng(p.svg, p.w, p.h, 2))
  }
  if (id === 'json') return downloadText(`${name}.json`, JSON.stringify(locationJson(location, map), null, 2))
  if (id === 'tiled') {
    const zip = new JSZip()
    const image = `${name}.png`
    const p = picture(project, location, map, { bare: true })
    const cell = mapNav(map).cell
    zip.file(`${name}.tmj`, JSON.stringify(tiledMap(location, map, { imageName: image }), null, 2))
    zip.file(image, await svgToPng(p.svg, p.w, p.h, 1))
    zip.file('hoh-walkability.png', await svgToPng(tilesetSvg(cell), 6 * cell, cell, 1))
    return downloadBlob(`${name} (Tiled).zip`, await zip.generateAsync({ type: 'blob' }))
  }
  // Universal VTT: the players' picture, 70 pixels to a 50-unit grid square.
  const p = picture(project, location, map, { player: true, bare: true })
  const scale = 70 / 50
  const image = await asBase64(await svgToPng(p.svg, p.w, p.h, scale))
  return downloadText(`${name}.dd2vtt`, JSON.stringify(universalVtt(map, { gridSize: 50, pixelsPerGrid: 70, image })), 'application/json')
}
