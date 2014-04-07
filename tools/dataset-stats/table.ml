open Core.Std;;

type t = string list list

let of_string_list_list = ident
let to_string_list_list = ident

let rec transpose m =
    let f = function
        | x::xs -> (Some x, xs)
        | [] -> (None, [])
    in
    let first_items, rest = List.unzip (List.map ~f m) in
    if List.for_all ~f:(fun x -> x = []) rest
    then [first_items] else first_items::transpose rest

let longest strs =
    let f = function
        | Some s -> String.length s
        | None -> 0
    in
    let lengths = List.map strs ~f in
    List.fold ~init:0 ~f:Int.max lengths

let pad length str =
    let extend_by = length - String.length str in
    let extend_by' = Int.max 0 extend_by in
    str ^ (String.make extend_by' ' ')

let zip_shortest a b =
    let rec f a b accum =
        match a, b with
        | x::xs, y::ys -> f xs ys ((x, y)::accum)
        | _ -> accum
    in
    List.rev (f a b [])

let format_row col_lengths row =
    let l = zip_shortest col_lengths row in
    let p = List.map ~f:(fun (a, b) -> pad a b) l in
    String.concat ~sep:" " p

let to_string tbl =
    let col_lengths = List.map ~f:longest (transpose tbl) in
    let rev_rows = List.rev_map ~f:(format_row col_lengths) tbl in
    (* add a newline on the end *)
    let rows = List.rev (""::rev_rows) in
    String.concat ~sep:"\n" rows
